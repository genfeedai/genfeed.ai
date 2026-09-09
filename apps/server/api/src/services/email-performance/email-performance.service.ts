import { randomBytes } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  approvedEmailDestination,
  emailIdentityHash,
  verifyEmailWebhook,
} from '@api/services/email-performance/email-performance.security';
import type {
  EmailConversionInput,
  QueueSystemEmailInput,
  SignedEmailWebhookHeaders,
} from '@api/services/email-performance/email-performance.types';
import { SystemEmailEligibilityService } from '@api/services/lifecycle-emails/system-email-eligibility.service';
import {
  EmailDeliveryError,
  NotificationsService,
} from '@api/services/notifications/notifications.service';
import { NotificationPreferenceService } from '@api/services/notifications/workflow-notifications/notification-preference.service';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { NotificationTopic } from '@genfeedai/contracts/interfaces';
import { escapeSystemEmailHtml } from '@helpers/email/system-email.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * The provider posts receipts for every message on the account, including mail
 * this service never sent (workflow status, agent, authentication). Those never
 * match an `EmailMessage`, so without a terminal state they accumulate forever
 * and rotate against genuinely pending receipts in recovery.
 */
const PROVIDER_EVENT_RESOLUTION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const PROVIDER_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const WEBHOOK_FIELDS = {
  'email.sent': 'acceptedAt',
  'email.delivered': 'deliveredAt',
  'email.opened': 'openedAt',
  'email.clicked': 'clickedAt',
  'email.bounced': 'bouncedAt',
  'email.complained': 'complainedAt',
} as const;

@Injectable()
export class EmailPerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly queue: WorkflowNotificationQueueService,
    private readonly preferences: NotificationPreferenceService,
    private readonly eligibility: SystemEmailEligibilityService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async queueEmail(input: QueueSystemEmailInput): Promise<string> {
    const destinationUrl = approvedEmailDestination(
      input.destinationUrl,
      this.appUrl(),
    );
    const token = randomBytes(32).toString('base64url');
    const apiUrl =
      this.config.get('GENFEEDAI_API_URL') ?? 'https://api.genfeed.ai/v1';
    const apiBase = apiUrl.replace(/\/$/, '');
    const trackingUrl = `${apiBase.endsWith('/v1') ? apiBase : `${apiBase}/v1`}/email-performance/click/${token}`;
    const html = input.html.replaceAll(
      '{{emailActionUrl}}',
      escapeSystemEmailHtml(trackingUrl),
    );
    const text = input.text?.replaceAll('{{emailActionUrl}}', trackingUrl);
    const key = `system-email/${input.organizationId}/${input.userId}/${input.idempotencyKey}`;
    const delivery = await this.prisma.$transaction(async (tx) => {
      // tenant-scope-ignore: compound namespaced idempotency key includes canonical organization and recipient.
      const event = await tx.notificationEvent.upsert({
        where: { deduplicationKey: key },
        update: {},
        create: {
          organizationId: input.organizationId,
          eventKey: `email.${input.templateKey}`,
          deduplicationKey: key,
          sourceType: 'system_email',
          sourceId: input.idempotencyKey,
          actorUserId: input.userId,
          occurredAt: new Date(),
          payload: {
            subject: input.subject,
            html,
            text: text ?? null,
            policyData: input.policyData ?? null,
            lifecycleDeliveryId: input.lifecycleDeliveryId ?? null,
          },
        },
      });
      // tenant-scope-ignore: namespaced idempotency key persists organization and user on creation.
      const row = await tx.notificationDelivery.upsert({
        where: { idempotencyKey: key },
        update: {},
        create: {
          eventId: event.id,
          userId: input.userId,
          organizationId: input.organizationId,
          channel: 'email',
          provider: 'resend',
          topic: input.topic,
          idempotencyKey: key,
          nextAttemptAt: input.dueAt ?? new Date(),
        },
      });
      // tenant-scope-ignore: delivery ID is created within this organization-scoped transaction.
      await tx.emailMessage.upsert({
        where: { deliveryId: row.id },
        update: {},
        create: {
          deliveryId: row.id,
          organizationId: input.organizationId,
          userId: input.userId,
          templateKey: input.templateKey,
          goal: input.goal,
          destinationUrl,
          clickTokenHash: emailIdentityHash(token),
        },
      });
      return row;
    });
    try {
      await this.queue.enqueue(delivery.id);
    } catch {
      this.logger.warn('System email remains pending for durable recovery', {
        deliveryId: delivery.id,
      });
    }
    return delivery.id;
  }

  /** Called only after the shared notification worker atomically acquires its lease. */
  async deliverClaimed(deliveryId: string): Promise<void> {
    // tenant-scope-ignore: system worker resolves an already-claimed opaque outbox ID.
    const row = await this.prisma.notificationDelivery.findFirst({
      where: { id: deliveryId, isDeleted: false, status: 'processing' },
      include: {
        event: true,
        emailMessage: true,
        user: { select: { email: true, isDeleted: true } },
      },
    });
    if (!row) return;
    const payload =
      row.event.payload &&
      typeof row.event.payload === 'object' &&
      !Array.isArray(row.event.payload)
        ? row.event.payload
        : {};
    const legacyId =
      typeof payload.lifecycleDeliveryId === 'string'
        ? payload.lifecycleDeliveryId
        : null;
    try {
      if (row.attemptCount > 5) throw new EmailDeliveryError(false, 429);
      if (
        !row.emailMessage ||
        typeof payload.html !== 'string' ||
        typeof payload.subject !== 'string'
      )
        throw new EmailDeliveryError(false, 400);
      const recipientHash = row.user.email
        ? emailIdentityHash(row.user.email.trim().toLowerCase())
        : null;
      const isDeliverable = await this.isRecipientDeliverable({
        email: row.user.email,
        isUserDeleted: row.user.isDeleted,
        organizationId: row.organizationId,
        policyData: payload.policyData,
        recipientHash,
        templateKey: row.emailMessage.templateKey,
        topic: row.topic,
        userId: row.userId,
      });
      if (!isDeliverable) {
        await this.recordDeliverySkipped(
          deliveryId,
          row.organizationId,
          row.userId,
          legacyId,
        );
        return;
      }
      await this.prisma.emailMessage.updateMany({
        where: {
          deliveryId,
          organizationId: row.organizationId,
          isDeleted: false,
        },
        data: { recipientHash },
      });
      const providerMessageId = await this.notifications.deliverEmail({
        to: row.user.email,
        subject: payload.subject,
        html: payload.html,
        ...(typeof payload.text === 'string' ? { text: payload.text } : {}),
        idempotencyKey: `system-email/${row.id}`,
      });
      await this.recordDeliveryAccepted({
        deliveryId,
        legacyId,
        organizationId: row.organizationId,
        providerMessageId,
        userId: row.userId,
      });
      await this.reconcileProviderEvents(providerMessageId);
    } catch (error: unknown) {
      const terminal =
        row.attemptCount >= 5 ||
        (error instanceof EmailDeliveryError && !error.retryable);
      await this.recordDeliveryFailure({
        attemptCount: row.attemptCount,
        deliveryId,
        legacyId,
        organizationId: row.organizationId,
        terminal,
        userId: row.userId,
      });
      this.logger.warn('System email delivery requires recovery', {
        deliveryId,
        terminal,
      });
    }
  }

  /**
   * A claimed delivery is only sent to a live recipient who still belongs to the
   * organization (or owns its billing account for billing mail), is not
   * suppressed, has the topic enabled, and passes the template's own policy.
   */
  private async isRecipientDeliverable(input: {
    email: string | null;
    isUserDeleted: boolean;
    organizationId: string;
    policyData: unknown;
    recipientHash: string | null;
    templateKey: string;
    topic: string;
    userId: string;
  }): Promise<boolean> {
    const [membership, suppressed, preference] = await Promise.all([
      this.prisma.member.findFirst({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          isDeleted: false,
          isActive: true,
        },
        select: { id: true },
      }),
      // tenant-scope-ignore: bounce/complaint suppression follows an email address across organizations.
      input.recipientHash
        ? this.prisma.emailSuppression.findUnique({
            where: { recipientHash: input.recipientHash },
          })
        : null,
      input.topic === 'billing.receipt'
        ? Promise.resolve({ isEnabled: true })
        : this.preferences.findForUser(
            input.userId,
            input.topic as NotificationTopic,
          ),
    ]);
    const billingAccess =
      !membership &&
      (input.topic === 'billing.credits' || input.topic === 'billing.receipt')
        ? await this.prisma.organization.findFirst({
            where: {
              id: input.organizationId,
              isDeleted: false,
              billingAccount: {
                is: {
                  isDeleted: false,
                  members: {
                    some: {
                      userId: input.userId,
                      role: 'OWNER',
                      isDeleted: false,
                    },
                  },
                },
              },
            },
            select: { id: true },
          })
        : null;
    if (
      (!membership && !billingAccess) ||
      input.isUserDeleted ||
      !input.email ||
      suppressed ||
      !preference.isEnabled
    ) {
      return false;
    }
    return this.eligibility.shouldSend({
      userId: input.userId,
      organizationId: input.organizationId,
      templateKey: input.templateKey,
      policyData: input.policyData,
    });
  }

  private async recordDeliverySkipped(
    deliveryId: string,
    organizationId: string,
    userId: string,
    legacyId: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins the delivery id inside its own organization, so this updates exactly one row.
      await tx.notificationDelivery.updateMany({
        where: scopedWhere(organizationId, { id: deliveryId }),
        data: {
          status: 'skipped',
          skippedAt: new Date(),
          lockedAt: null,
          lastError: 'recipient_preference_or_eligibility',
        },
      });
      if (legacyId)
        // sql-risk-audit: ignore bulk-write-tenant-review -- LifecycleEmailDelivery is keyed by user, not organization; `where` pins the primary key and the recipient, so this updates at most one row.
        await tx.lifecycleEmailDelivery.updateMany({
          where: {
            id: legacyId,
            userId,
            status: { notIn: ['sent', 'canceled'] },
          },
          data: { status: 'skipped', skippedAt: new Date() },
        });
    });
  }

  private async recordDeliveryAccepted(input: {
    deliveryId: string;
    legacyId: string | null;
    organizationId: string;
    providerMessageId: string;
    userId: string;
  }): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins the delivery id inside its own organization, so this updates exactly one row.
      await tx.notificationDelivery.updateMany({
        where: scopedWhere(input.organizationId, { id: input.deliveryId }),
        data: {
          status: 'delivered',
          deliveredAt: now,
          lockedAt: null,
          lastError: null,
          providerMessageId: input.providerMessageId,
        },
      });
      await tx.emailMessage.updateMany({
        where: {
          deliveryId: input.deliveryId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: { acceptedAt: now, providerMessageId: input.providerMessageId },
      });
      if (input.legacyId)
        await tx.lifecycleEmailDelivery.updateMany({
          where: {
            id: input.legacyId,
            userId: input.userId,
            status: { notIn: ['sent', 'canceled', 'skipped'] },
          },
          data: { status: 'sent', sentAt: now, failureReason: null },
        });
    });
  }

  private async recordDeliveryFailure(input: {
    attemptCount: number;
    deliveryId: string;
    legacyId: string | null;
    organizationId: string;
    terminal: boolean;
    userId: string;
  }): Promise<void> {
    // Provider errors may echo a recipient; durable diagnostics deliberately retain only a stable category.
    await this.prisma.$transaction(async (tx) => {
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins the delivery id inside its own organization; the status predicate narrows it to the in-flight attempt.
      await tx.notificationDelivery.updateMany({
        where: scopedWhere(input.organizationId, {
          id: input.deliveryId,
          status: 'processing',
        }),
        data: {
          status: input.terminal ? 'failed' : 'retry_pending',
          lockedAt: null,
          lastError: input.terminal
            ? 'email_delivery_failed'
            : 'email_delivery_retry',
          nextAttemptAt: new Date(
            Date.now() + Math.min(3_600_000, 30_000 * 2 ** input.attemptCount),
          ),
        },
      });
      if (input.terminal && input.legacyId)
        await tx.lifecycleEmailDelivery.updateMany({
          where: {
            id: input.legacyId,
            userId: input.userId,
            status: { notIn: ['sent', 'canceled', 'skipped'] },
          },
          data: { status: 'failed', failureReason: 'email_delivery_failed' },
        });
    });
  }

  async trackClick(token: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new NotFoundException('Email link');
    // tenant-scope-ignore: unguessable capability resolves only its stored approved destination, never a caller-provided redirect.
    const message = await this.prisma.emailMessage.findFirst({
      where: {
        clickTokenHash: emailIdentityHash(token),
        isDeleted: false,
        acceptedAt: { not: null },
      },
    });
    if (!message) throw new NotFoundException('Email link');
    // A destination approved when the link was issued can stop validating if
    // the configured app origin changes. That is a dead link, not a server
    // fault, so it must not surface as a 500 to whoever clicked it.
    let destination: string;
    try {
      destination = approvedEmailDestination(
        message.destinationUrl,
        this.appUrl(),
      );
    } catch {
      throw new NotFoundException('Email link');
    }
    const occurredAt = new Date();
    await this.prisma.$transaction([
      this.prisma.emailMessage.updateMany({
        where: {
          id: message.id,
          organizationId: message.organizationId,
          isDeleted: false,
        },
        data: { clickedAt: occurredAt },
      }),
      this.prisma.emailClick.create({
        data: {
          messageId: message.id,
          organizationId: message.organizationId,
          userId: message.userId,
          occurredAt,
        },
      }),
    ]);
    return destination;
  }

  async recordConversion(input: EmailConversionInput): Promise<string | null> {
    const occurredAt = input.occurredAt ?? new Date();
    if (
      !Number.isFinite(occurredAt.getTime()) ||
      occurredAt.getTime() > Date.now() + 60_000
    )
      return null;
    const click = await this.prisma.emailClick.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
        isDeleted: false,
        occurredAt: {
          gte: new Date(occurredAt.getTime() - ATTRIBUTION_WINDOW_MS),
          lte: occurredAt,
        },
        message: {
          is: {
            organizationId: input.organizationId,
            userId: input.userId,
            goal: input.goal,
            isDeleted: false,
            acceptedAt: { not: null },
          },
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { messageId: true },
    });
    if (!click) return null;
    // tenant-scope-ignore: compound conversion identity contains organization and canonical recipient.
    const conversion = await this.prisma.emailConversion.upsert({
      where: {
        organizationId_userId_goal_sourceId: {
          organizationId: input.organizationId,
          userId: input.userId,
          goal: input.goal,
          sourceId: input.sourceId,
        },
      },
      update: {},
      create: {
        organizationId: input.organizationId,
        userId: input.userId,
        goal: input.goal,
        sourceId: input.sourceId,
        messageId: click.messageId,
        occurredAt,
        value:
          input.value !== undefined && Number.isFinite(input.value)
            ? input.value
            : null,
      },
    });
    return conversion.messageId;
  }

  async receiveWebhook(
    body: Buffer,
    headers: SignedEmailWebhookHeaders,
  ): Promise<void> {
    const secret = this.config.get('RESEND_WEBHOOK_SECRET') ?? '';
    if (!verifyEmailWebhook(body, headers, secret))
      throw new UnauthorizedException('Invalid webhook signature');
    let payload: unknown;
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }
    if (!payload || typeof payload !== 'object')
      throw new BadRequestException('Invalid webhook payload');
    const event = payload as Record<string, unknown>;
    const data =
      event.data && typeof event.data === 'object'
        ? (event.data as Record<string, unknown>)
        : {};
    if (typeof event.type !== 'string' || !(event.type in WEBHOOK_FIELDS))
      return;
    if (
      typeof data.email_id !== 'string' ||
      typeof event.created_at !== 'string'
    )
      throw new BadRequestException('Invalid webhook event');
    const occurredAt = new Date(event.created_at);
    if (!Number.isFinite(occurredAt.getTime()))
      throw new BadRequestException('Invalid webhook timestamp');
    // tenant-scope-ignore: verified provider receipts have a global event ID; no raw payload/recipient is retained.
    await this.prisma.emailProviderEvent.upsert({
      where: { id: headers.id as string },
      update: {},
      create: {
        id: headers.id as string,
        providerMessageId: data.email_id,
        eventType: event.type,
        occurredAt,
      },
    });
    await this.reconcileProviderEvents(data.email_id);
  }

  async recoverProviderEvents(): Promise<void> {
    const now = Date.now();
    // tenant-scope-ignore: verified provider receipts carry no tenant; abandoning and pruning them touches no organization data.
    // sql-risk-audit: ignore bulk-write-tenant-review -- EmailProviderEvent is a global provider-receipt log with no tenant column; the predicate is an age bound on unresolved receipts.
    await this.prisma.emailProviderEvent.updateMany({
      where: {
        processedAt: null,
        createdAt: {
          lt: new Date(now - PROVIDER_EVENT_RESOLUTION_WINDOW_MS),
        },
      },
      data: { processedAt: new Date() },
    });
    // tenant-scope-ignore: prunes settled receipts only; no tenant data is stored on this table.
    // sql-risk-audit: ignore bulk-write-tenant-review -- EmailProviderEvent is a global provider-receipt log with no tenant column; only rows already settled past the retention window are removed.
    await this.prisma.emailProviderEvent.deleteMany({
      where: {
        processedAt: { lt: new Date(now - PROVIDER_EVENT_RETENTION_MS) },
      },
    });
    // tenant-scope-ignore: recovery spans verified provider receipts; each reconciliation resolves its organization before mutation.
    const pending = await this.prisma.emailProviderEvent.findMany({
      where: { processedAt: null },
      orderBy: { lastAttemptAt: { sort: 'asc', nulls: 'first' } },
      distinct: ['providerMessageId'],
      take: 100,
      select: { providerMessageId: true },
    });
    for (const receipt of pending)
      await this.reconcileProviderEvents(receipt.providerMessageId);
  }

  async reconcileProviderEvents(providerMessageId: string): Promise<void> {
    // tenant-scope-ignore: rotate unresolved signed receipts through recovery without starving later provider IDs.
    // sql-risk-audit: ignore bulk-write-tenant-review -- EmailProviderEvent is a global provider-receipt log with no tenant column; this stamps the attempt time for one provider message id.
    await this.prisma.emailProviderEvent.updateMany({
      where: { providerMessageId, processedAt: null },
      data: { lastAttemptAt: new Date() },
    });
    // tenant-scope-ignore: a signed provider message ID resolves its tenant before any message mutation.
    const message = await this.prisma.emailMessage.findFirst({
      where: { providerMessageId, isDeleted: false },
    });
    if (!message) return;
    // tenant-scope-ignore: provider receipts are globally identified; only this verified message's receipts are read.
    const events = await this.prisma.emailProviderEvent.findMany({
      where: { providerMessageId, processedAt: null },
      orderBy: { occurredAt: 'asc' },
      take: 100,
    });
    for (const event of events) {
      const field =
        WEBHOOK_FIELDS[event.eventType as keyof typeof WEBHOOK_FIELDS];
      if (!field) continue;
      await this.prisma.$transaction(async (tx) => {
        const where = {
          id: message.id,
          organizationId: message.organizationId,
          isDeleted: false,
        };
        // Out-of-order receipts cannot erase evidence or regress the click used for last-touch association.
        // sql-risk-audit: ignore bulk-write-tenant-review -- `where` pins the message id and its resolved organizationId, so this updates exactly one row.
        await tx.emailMessage.updateMany({
          where: {
            ...where,
            OR: [
              { [field]: null },
              {
                [field]:
                  field === 'clickedAt'
                    ? { lt: event.occurredAt }
                    : { gt: event.occurredAt },
              },
            ],
          },
          data: { [field]: event.occurredAt },
        });
        if (
          message.recipientHash &&
          (field === 'bouncedAt' || field === 'complainedAt')
        ) {
          // tenant-scope-ignore: recipient suppression is deliberately global deliverability state.
          await tx.emailSuppression.upsert({
            where: { recipientHash: message.recipientHash },
            update: { reason: event.eventType },
            create: {
              recipientHash: message.recipientHash,
              reason: event.eventType,
            },
          });
        }
        // tenant-scope-ignore: provider event was signature-verified and resolved to the scoped message above.
        await tx.emailProviderEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
      });
    }
  }

  private appUrl(): string {
    return this.config.get('GENFEEDAI_APP_URL') ?? 'https://app.genfeed.ai';
  }
}
