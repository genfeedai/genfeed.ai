import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { CreateNewsletterSendDto } from '@api/collections/newsletter-sends/dto/create-newsletter-send.dto';
import { NewsletterEmailService } from '@api/collections/newsletter-sends/services/newsletter-email.service';
import { NewsletterProviderEventsService } from '@api/collections/newsletter-sends/services/newsletter-provider-events.service';
import { NewsletterRecipientAccessService } from '@api/collections/newsletter-sends/services/newsletter-recipient-access.service';
import { NewsletterUsageService } from '@api/collections/newsletter-sends/services/newsletter-usage.service';
import { personalizeNewsletterEmail } from '@api/collections/newsletter-sends/utils/newsletter-email-template.util';
import { subscriberEmailHash } from '@api/collections/newsletter-sends/utils/newsletter-token.util';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { EmailDeliveryError } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  NewsletterAccessLevel,
  NewsletterSendAction,
} from '@genfeedai/contracts/constants';
import { isNewsletterAccessLevel } from '@genfeedai/contracts/constants';
import type { INewsletterEmailPreview } from '@genfeedai/contracts/interfaces';
import { type NewsletterSend, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

/** Recipients delivered per batch; each batch re-checks pause and cancel. */
const RECIPIENT_BATCH_SIZE = 100;
const DELIVERY_CONCURRENCY = 10;
/** One claim works this long, then hands the rest to the next tick. */
const CLAIM_BUDGET_MS = 45_000;
/** A claim older than this belongs to a worker that died mid-send. */
const STALE_LOCK_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const DUE_SENDS_PER_TICK = 5;
const SENDABLE_ISSUE_STATUSES = new Set(['approved', 'published']);
const CLAIMABLE_STATUSES = ['scheduled', 'sending'];
const MATERIALIZE_PAGE_SIZE = 1_000;

type ClaimedRecipient = Prisma.NewsletterSendRecipientGetPayload<{
  include: {
    subscriber: {
      select: { email: true; id: true; isDeleted: true; status: true };
    };
  };
}>;

/**
 * The newsletter delivery engine (#9726). An issue is sent once: the send row
 * is unique per issue, each subscriber gets exactly one recipient row, and the
 * provider idempotency key is the recipient id, so a retried batch never
 * double-sends. The workers app drives `processDueSends` every minute.
 */
@Traced()
@Injectable()
export class NewsletterSendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly newsletters: NewslettersService,
    private readonly emails: NewsletterEmailService,
    private readonly usage: NewsletterUsageService,
    private readonly access: NewsletterRecipientAccessService,
    private readonly providerEvents: NewsletterProviderEventsService,
    private readonly logger: LoggerService,
  ) {}

  async create(
    user: AuthenticatedUser,
    newsletterId: string,
    dto: CreateNewsletterSendDto,
  ): Promise<NewsletterSend> {
    const issue = await this.findIssue(user, newsletterId);
    if (!issue.content?.trim()) {
      throw new BadRequestException(
        'Add content to the issue before sending it.',
      );
    }
    if (!SENDABLE_ISSUE_STATUSES.has(issue.status)) {
      throw new BadRequestException('Approve the issue before sending it.');
    }
    const brandId = issue.brandId;
    const scheduledFor = dto.scheduledFor
      ? new Date(dto.scheduledFor)
      : new Date();
    const activeSubscribers = await this.prisma.brandSubscriber.count({
      where: scopedWhere(user.organizationId, { brandId, status: 'active' }),
    });
    if (activeSubscribers === 0) {
      throw new BadRequestException(
        'This newsletter has no active subscribers yet.',
      );
    }
    await this.usage.assertSendCapacity(user.organizationId, activeSubscribers);
    if (issue.status !== 'published') {
      await this.newsletters.publishScoped(issue.id, {
        brandId,
        organizationId: user.organizationId,
        userId: user.userId,
      });
    }

    const look = await this.emails.getBrandLook(user.organizationId, brandId);
    const accessLevel = this.readAccessLevel(issue.accessLevel);
    const full = this.emails.renderIssue(look, issue);
    const preview =
      accessLevel === 'public'
        ? null
        : this.emails.renderIssue(look, issue, true);

    let send: NewsletterSend;
    try {
      send = await this.prisma.newsletterSend.create({
        data: {
          brandId,
          html: full.html,
          idempotencyKey: `newsletter/${issue.id}`,
          links: full.links,
          newsletterId: issue.id,
          organizationId: user.organizationId,
          previewHtml: preview?.html ?? null,
          previewText: preview?.text ?? null,
          scheduledFor,
          subject: issue.label,
          text: full.text,
          userId: user.userId,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This issue has already been sent.');
      }
      throw error;
    }
    if (scheduledFor.getTime() <= Date.now()) {
      void this.processSend(send.id).catch((error: unknown) =>
        this.logger.warn('Newsletter send continues on the next worker tick', {
          error: error instanceof Error ? error.message : 'unknown',
          sendId: send.id,
        }),
      );
    }
    return send;
  }

  async list(
    user: AuthenticatedUser,
    brandId: string,
    page = 1,
    limit = 20,
  ): Promise<{ docs: NewsletterSend[]; total: number }> {
    await this.brandAccess.assert(user, brandId);
    const where = scopedWhere(user.organizationId, { brandId });
    const [docs, total] = await Promise.all([
      this.prisma.newsletterSend.findMany({
        omit: { html: true, previewHtml: true, previewText: true, text: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.newsletterSend.count({ where }),
    ]);
    return { docs: docs as NewsletterSend[], total };
  }

  async control(
    user: AuthenticatedUser,
    sendId: string,
    action: NewsletterSendAction,
  ): Promise<NewsletterSend> {
    const send = await this.prisma.newsletterSend.findFirst({
      where: scopedWhere(user.organizationId, { id: sendId }),
    });
    if (!send) throw new NotFoundException('Newsletter send', sendId);
    await this.brandAccess.assert(user, send.brandId);

    const transitions: Record<
      NewsletterSendAction,
      { from: string[]; data: Prisma.NewsletterSendUpdateManyMutationInput }
    > = {
      cancel: {
        data: { canceledAt: new Date(), lockedAt: null, status: 'canceled' },
        from: ['scheduled', 'sending', 'paused'],
      },
      pause: { data: { status: 'paused' }, from: ['scheduled', 'sending'] },
      resume: {
        data: {
          lockedAt: null,
          status: send.startedAt ? 'sending' : 'scheduled',
        },
        from: ['paused'],
      },
    };
    const transition = transitions[action];
    // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins this one send inside its organization; the status predicate makes the transition atomic.
    const updated = await this.prisma.newsletterSend.updateMany({
      data: transition.data,
      where: scopedWhere(user.organizationId, {
        id: sendId,
        status: { in: transition.from },
      }),
    });
    if (updated.count === 0) {
      throw new ConflictException(`A ${send.status} send cannot ${action}.`);
    }
    if (action === 'cancel') {
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins the canceled send's undelivered recipients inside its organization.
      await this.prisma.newsletterSendRecipient.updateMany({
        data: { lastError: 'send_canceled', status: 'skipped' },
        where: scopedWhere(user.organizationId, { sendId, status: 'pending' }),
      });
      await this.refreshCounts(send.organizationId, sendId);
    }
    const result = await this.prisma.newsletterSend.findFirst({
      where: scopedWhere(user.organizationId, { id: sendId }),
    });
    if (!result) throw new NotFoundException('Newsletter send', sendId);
    return result;
  }

  /** The issue email as subscribers will see it, for the in-app preview. */
  async preview(
    user: AuthenticatedUser,
    newsletterId: string,
    isGatedPreview = false,
  ): Promise<INewsletterEmailPreview> {
    const issue = await this.findIssue(user, newsletterId);
    const look = await this.emails.getBrandLook(
      user.organizationId,
      issue.brandId,
    );
    const template = this.emails.renderIssue(look, issue, isGatedPreview);
    const filled = personalizeNewsletterEmail(template, {
      linkUrl: (index) => template.links[index] ?? '#',
      unsubscribeUrl: '#',
    });
    return { ...filled, subject: issue.label };
  }

  /** Send the issue to the signed-in member only; nothing is recorded. */
  async sendTest(
    user: AuthenticatedUser,
    newsletterId: string,
  ): Promise<{ to: string }> {
    const issue = await this.findIssue(user, newsletterId);
    const member = await this.prisma.user.findFirst({
      select: { email: true },
      where: { id: user.userId, isDeleted: false },
    });
    if (!member?.email) {
      throw new BadRequestException('Your account has no email address.');
    }
    const look = await this.emails.getBrandLook(
      user.organizationId,
      issue.brandId,
    );
    const template = this.emails.renderIssue(look, issue);
    const filled = personalizeNewsletterEmail(template, {
      linkUrl: (index) => template.links[index] ?? '#',
      unsubscribeUrl: this.emails.issueWebUrl(issue.id),
    });
    await this.emails.deliver({
      ...filled,
      idempotencyKey: `newsletter-test/${issue.id}/${Date.now()}`,
      look,
      subject: `[Test] ${issue.label}`,
      to: member.email,
    });
    return { to: member.email };
  }

  /** Worker entry point: continue every due send, a few per tick. */
  async processDueSends(): Promise<void> {
    const now = new Date();
    // tenant-scope-ignore: the system sweep finds due sends across organizations; each send is processed inside its own organization.
    const due = await this.prisma.newsletterSend.findMany({
      orderBy: { scheduledFor: 'asc' },
      select: { id: true },
      take: DUE_SENDS_PER_TICK,
      where: {
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
        ],
        isDeleted: false,
        scheduledFor: { lte: now },
        status: { in: CLAIMABLE_STATUSES },
      },
    });
    for (const send of due) {
      await this.processSend(send.id);
    }
  }

  async processSend(sendId: string): Promise<void> {
    const startedAt = Date.now();
    const claimedAt = new Date();
    // sql-risk-audit: ignore bulk-write-tenant-review -- claims exactly one send by primary key; the status and lock predicates make the claim atomic.
    // tenant-scope-ignore: claims one send by opaque id for the system worker; the organization is read from the claimed row.
    const claim = await this.prisma.newsletterSend.updateMany({
      data: { lockedAt: claimedAt, status: 'sending' },
      where: {
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: new Date(claimedAt.getTime() - STALE_LOCK_MS) } },
        ],
        id: sendId,
        isDeleted: false,
        scheduledFor: { lte: claimedAt },
        status: { in: CLAIMABLE_STATUSES },
      },
    });
    if (claim.count === 0) return;
    // tenant-scope-ignore: reads the send this worker just claimed by primary key.
    const send = await this.prisma.newsletterSend.findFirst({
      include: { newsletter: { select: { accessLevel: true } } },
      where: { id: sendId, isDeleted: false },
    });
    if (!send) return;
    const orgId = send.organizationId;

    try {
      if (!send.startedAt) {
        await this.materializeRecipients(send);
      }
      const look = await this.emails.getBrandLook(orgId, send.brandId);
      const accessLevel = this.readAccessLevel(send.newsletter.accessLevel);
      const links = Array.isArray(send.links)
        ? send.links.filter((link): link is string => typeof link === 'string')
        : [];

      while (Date.now() - startedAt < CLAIM_BUDGET_MS) {
        const current = await this.prisma.newsletterSend.findFirst({
          select: { status: true },
          where: scopedWhere(orgId, { id: sendId }),
        });
        if (current?.status !== 'sending') break;
        const batch = await this.prisma.newsletterSendRecipient.findMany({
          include: {
            subscriber: {
              select: { email: true, id: true, isDeleted: true, status: true },
            },
          },
          orderBy: { id: 'asc' },
          take: RECIPIENT_BATCH_SIZE,
          where: scopedWhere(orgId, {
            OR: [
              { nextAttemptAt: null },
              { nextAttemptAt: { lte: new Date() } },
            ],
            sendId,
            status: 'pending',
          }),
        });
        if (batch.length === 0) break;
        for (
          let index = 0;
          index < batch.length;
          index += DELIVERY_CONCURRENCY
        ) {
          await Promise.all(
            batch
              .slice(index, index + DELIVERY_CONCURRENCY)
              .map((recipient) =>
                this.deliverRecipient(
                  send,
                  recipient,
                  look,
                  links,
                  accessLevel,
                ),
              ),
          );
        }
      }
      await this.finishClaim(orgId, sendId);
    } catch (error: unknown) {
      // sql-risk-audit: ignore bulk-write-tenant-review -- releases this worker's claim on one send; the organization comes from the claimed row.
      await this.prisma.newsletterSend.updateMany({
        data: {
          lastError:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'send_failed',
          lockedAt: null,
        },
        where: scopedWhere(orgId, { id: sendId }),
      });
      throw error;
    }
  }

  /** One recipient row per active subscriber at the moment the send starts. */
  private async materializeRecipients(send: NewsletterSend): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.brandSubscriber.findMany({
        orderBy: { id: 'asc' },
        select: { emailHash: true, id: true },
        take: MATERIALIZE_PAGE_SIZE,
        where: scopedWhere(send.organizationId, {
          brandId: send.brandId,
          status: 'active',
          ...(cursor ? { id: { gt: cursor } } : {}),
        }),
      });
      if (page.length === 0) break;
      await this.prisma.newsletterSendRecipient.createMany({
        data: page.map((subscriber) => ({
          organizationId: send.organizationId,
          recipientHash: subscriber.emailHash,
          sendId: send.id,
          subscriberId: subscriber.id,
        })),
        skipDuplicates: true,
      });
      cursor = page[page.length - 1]?.id;
      if (page.length < MATERIALIZE_PAGE_SIZE) break;
    }
    const recipientCount = await this.prisma.newsletterSendRecipient.count({
      where: scopedWhere(send.organizationId, { sendId: send.id }),
    });
    // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins this one send inside its organization.
    await this.prisma.newsletterSend.updateMany({
      data: { recipientCount, startedAt: new Date() },
      where: scopedWhere(send.organizationId, { id: send.id }),
    });
  }

  private async deliverRecipient(
    send: NewsletterSend,
    recipient: ClaimedRecipient,
    look: Awaited<ReturnType<NewsletterEmailService['getBrandLook']>>,
    links: string[],
    accessLevel: NewsletterAccessLevel,
  ): Promise<void> {
    const orgId = send.organizationId;
    const where = scopedWhere(orgId, { id: recipient.id, status: 'pending' });
    const subscriber = recipient.subscriber;
    const isSuppressed = await this.prisma.emailSuppression.findUnique({
      // tenant-scope-ignore: bounce and complaint suppression follows an address across organizations.
      where: { recipientHash: subscriberEmailHash(subscriber.email) },
    });
    if (
      subscriber.isDeleted ||
      subscriber.status !== 'active' ||
      isSuppressed
    ) {
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one pending recipient inside its organization.
      await this.prisma.newsletterSendRecipient.updateMany({
        data: {
          lastError: isSuppressed ? 'suppressed' : 'subscriber_inactive',
          status: 'skipped',
        },
        where,
      });
      return;
    }
    const hasFullAccess = await this.access.hasFullAccess(
      { id: subscriber.id, organizationId: orgId },
      { accessLevel, brandId: send.brandId },
    );
    const template =
      hasFullAccess || !send.previewHtml || !send.previewText
        ? { html: send.html, text: send.text }
        : { html: send.previewHtml, text: send.previewText };
    const unsubscribeUrl = this.emails.unsubscribeUrl(subscriber.id);
    const filled = personalizeNewsletterEmail(template, {
      linkUrl: (index) =>
        links[index] ? this.emails.clickUrl(recipient.id, index) : '#',
      unsubscribeUrl,
    });
    try {
      const providerMessageId = await this.emails.deliver({
        ...filled,
        idempotencyKey: `newsletter-send/${recipient.id}`,
        look,
        subject: send.subject,
        to: subscriber.email,
        unsubscribeUrl,
      });
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one pending recipient inside its organization.
      await this.prisma.newsletterSendRecipient.updateMany({
        data: {
          attemptCount: { increment: 1 },
          lastError: null,
          providerMessageId,
          sentAt: new Date(),
          status: 'sent',
        },
        where,
      });
      await this.providerEvents.reconcile(providerMessageId);
    } catch (error: unknown) {
      const attempts = recipient.attemptCount + 1;
      const isTerminal =
        attempts >= MAX_ATTEMPTS ||
        (error instanceof EmailDeliveryError && !error.retryable);
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one pending recipient inside its organization.
      await this.prisma.newsletterSendRecipient.updateMany({
        data: {
          attemptCount: attempts,
          lastError: isTerminal
            ? 'email_delivery_failed'
            : 'email_delivery_retry',
          nextAttemptAt: new Date(
            Date.now() + Math.min(3_600_000, 30_000 * 2 ** attempts),
          ),
          status: isTerminal ? 'failed' : 'pending',
        },
        where,
      });
    }
  }

  /** Release the claim, and complete the send once nothing is left to try. */
  private async finishClaim(orgId: string, sendId: string): Promise<void> {
    const pending = await this.prisma.newsletterSendRecipient.count({
      where: scopedWhere(orgId, { sendId, status: 'pending' }),
    });
    await this.refreshCounts(orgId, sendId);
    // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins this one send inside its organization.
    await this.prisma.newsletterSend.updateMany({
      data:
        pending === 0
          ? { completedAt: new Date(), lockedAt: null, status: 'completed' }
          : { lockedAt: null },
      // A send left `sending` with pending rows waits for their retries.
      where: scopedWhere(orgId, {
        id: sendId,
        ...(pending === 0 ? { status: 'sending' } : {}),
      }),
    });
  }

  private async refreshCounts(orgId: string, sendId: string): Promise<void> {
    const groups = await this.prisma.newsletterSendRecipient.groupBy({
      _count: { _all: true },
      by: ['status'],
      where: scopedWhere(orgId, { sendId }),
    });
    const count = (status: string) =>
      groups.find((group) => group.status === status)?._count._all ?? 0;
    // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins this one send inside its organization.
    await this.prisma.newsletterSend.updateMany({
      data: {
        failedCount: count('failed'),
        sentCount: count('sent'),
        skippedCount: count('skipped'),
      },
      where: scopedWhere(orgId, { id: sendId }),
    });
  }

  private async findIssue(user: AuthenticatedUser, newsletterId: string) {
    const issue = await this.prisma.newsletter.findFirst({
      select: {
        accessLevel: true,
        brandId: true,
        content: true,
        id: true,
        label: true,
        status: true,
        summary: true,
      },
      where: scopedWhere(user.organizationId, { id: newsletterId }),
    });
    if (!issue?.brandId)
      throw new NotFoundException('Newsletter', newsletterId);
    await this.brandAccess.assert(user, issue.brandId);
    return { ...issue, brandId: issue.brandId };
  }

  private readAccessLevel(value: string): NewsletterAccessLevel {
    return isNewsletterAccessLevel(value) ? value : 'public';
  }
}
