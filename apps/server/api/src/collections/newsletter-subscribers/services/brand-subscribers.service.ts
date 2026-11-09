import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { NewsletterEmailService } from '@api/collections/newsletter-sends/services/newsletter-email.service';
import { NewsletterUsageService } from '@api/collections/newsletter-sends/services/newsletter-usage.service';
import { subscriberEmailHash } from '@api/collections/newsletter-sends/utils/newsletter-token.util';
import type {
  AddBrandSubscribersDto,
  BrandSubscribersQueryDto,
  ImportBrandSubscribersDto,
  PublicSubscribeDto,
} from '@api/collections/newsletter-subscribers/dto/brand-subscribers.dto';
import {
  type ParsedSubscriberFile,
  type ParsedSubscriberRow,
  parseEmailList,
  parseSubscriberCsv,
  toCsv,
} from '@api/collections/newsletter-subscribers/utils/subscriber-csv.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  BRAND_SUBSCRIBER_BLOCKED_STATUSES,
  BRAND_SUBSCRIBER_IMPORT_MAX_ROWS,
  type BrandSubscriberSource,
} from '@genfeedai/contracts/constants';
import type {
  IBrandSubscriberImportSummary,
  IBrandSubscriberStats,
} from '@genfeedai/contracts/interfaces';
import type { BrandSubscriber } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

const SUMMARY_SAMPLE_SIZE = 20;
const CONFIRM_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A pending address is not re-mailed more often than this. */
const CONFIRM_RESEND_COOLDOWN_MS = 10 * 60 * 1000;
const CONFIRM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BLOCKED = new Set<string>(BRAND_SUBSCRIBER_BLOCKED_STATUSES);
const EXPORT_PAGE_SIZE = 1_000;
const WRITE_CHUNK_SIZE = 1_000;

interface ClassifiedRows {
  /** Rows with no subscriber yet (or only a removed one). */
  fresh: ParsedSubscriberRow[];
  duplicate: number;
  suppressed: number;
  /** Removed subscribers, by email hash, that `fresh` revives. */
  removedIds: Map<string, string>;
}

function confirmTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * A brand's audience (#9665, #9724): public double opt-in, add by email,
 * CSV import and export. Unsubscribed, bounced and complained addresses, and
 * anything on the global suppression list, are never re-added by the owner.
 */
@Traced()
@Injectable()
export class BrandSubscribersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly emails: NewsletterEmailService,
    private readonly usage: NewsletterUsageService,
    private readonly logger: LoggerService,
  ) {}

  async list(
    user: AuthenticatedUser,
    brandId: string,
    query: BrandSubscribersQueryDto,
  ): Promise<{
    docs: BrandSubscriber[];
    limit: number;
    page: number;
    total: number;
  }> {
    await this.brandAccess.assert(user, brandId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const search = query.search?.trim();
    const where = scopedWhere(user.organizationId, {
      brandId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    });
    const [docs, total] = await Promise.all([
      this.prisma.brandSubscriber.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.brandSubscriber.count({ where }),
    ]);
    return { docs, limit, page, total };
  }

  async stats(
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<IBrandSubscriberStats> {
    await this.brandAccess.assert(user, brandId);
    const groups = await this.prisma.brandSubscriber.groupBy({
      _count: { _all: true },
      by: ['status'],
      where: scopedWhere(user.organizationId, { brandId }),
    });
    const count = (status: string) =>
      groups.find((group) => group.status === status)?._count._all ?? 0;
    return {
      active: count('active'),
      bounced: count('bounced'),
      complained: count('complained'),
      pending: count('pending'),
      total: groups.reduce((sum, group) => sum + group._count._all, 0),
      unsubscribed: count('unsubscribed'),
    };
  }

  /** Add one address or a pasted list from the Subscribers page. */
  async add(
    user: AuthenticatedUser,
    brandId: string,
    dto: AddBrandSubscribersDto,
  ): Promise<IBrandSubscriberImportSummary> {
    await this.brandAccess.assert(user, brandId);
    const parsed = parseEmailList(dto.emails);
    const tags = [
      ...new Set((dto.tags ?? []).map((tag) => tag.trim()).filter(Boolean)),
    ];
    const rows = parsed.rows.map((row) => ({ ...row, tags }));
    return this.write(
      user,
      brandId,
      { ...parsed, rows },
      {
        hasConsent: dto.hasConsent,
        importId: null,
        isPreview: false,
        source: 'manual',
      },
    );
  }

  async importCsv(
    user: AuthenticatedUser,
    brandId: string,
    dto: ImportBrandSubscribersDto,
  ): Promise<IBrandSubscriberImportSummary> {
    await this.brandAccess.assert(user, brandId);
    const parsed = parseSubscriberCsv(dto.csv, {
      email: dto.emailColumn,
      name: dto.nameColumn,
      tags: dto.tagsColumn,
    });
    if (
      parsed.rows.length + parsed.invalid.length >
      BRAND_SUBSCRIBER_IMPORT_MAX_ROWS
    ) {
      throw new BadRequestException(
        `An import holds at most ${BRAND_SUBSCRIBER_IMPORT_MAX_ROWS} rows.`,
      );
    }
    if (dto.isPreview) {
      return this.write(user, brandId, parsed, {
        hasConsent: true,
        importId: null,
        isPreview: true,
        source: 'import',
      });
    }
    const record = await this.prisma.brandSubscriberImport.create({
      data: {
        brandId,
        consentConfirmedAt: new Date(),
        fileName: dto.fileName?.slice(0, 255) ?? null,
        organizationId: user.organizationId,
        userId: user.userId,
      },
    });
    const summary = await this.write(user, brandId, parsed, {
      hasConsent: true,
      importId: record.id,
      isPreview: false,
      source: 'import',
    });
    // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins the import row just created in this organization.
    await this.prisma.brandSubscriberImport.updateMany({
      data: {
        addedCount: summary.added,
        duplicateCount: summary.duplicate,
        invalidCount: summary.invalid,
        suppressedCount: summary.suppressed,
        totalRows: summary.totalRows,
      },
      where: scopedWhere(user.organizationId, { id: record.id }),
    });
    return { ...summary, importId: record.id };
  }

  async exportCsv(user: AuthenticatedUser, brandId: string): Promise<string> {
    await this.brandAccess.assert(user, brandId);
    const rows: string[][] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.brandSubscriber.findMany({
        orderBy: { id: 'asc' },
        take: EXPORT_PAGE_SIZE,
        where: scopedWhere(user.organizationId, {
          brandId,
          ...(cursor ? { id: { gt: cursor } } : {}),
        }),
      });
      for (const subscriber of page) {
        rows.push([
          subscriber.email,
          subscriber.name ?? '',
          subscriber.status,
          subscriber.source,
          subscriber.tags.join(';'),
          subscriber.createdAt.toISOString(),
          subscriber.confirmedAt?.toISOString() ?? '',
          subscriber.unsubscribedAt?.toISOString() ?? '',
        ]);
      }
      cursor = page[page.length - 1]?.id;
      if (page.length < EXPORT_PAGE_SIZE) break;
    }
    return toCsv(
      [
        'email',
        'name',
        'status',
        'source',
        'tags',
        'subscribed_at',
        'confirmed_at',
        'unsubscribed_at',
      ],
      rows,
    );
  }

  async remove(
    user: AuthenticatedUser,
    brandId: string,
    subscriberId: string,
  ): Promise<void> {
    await this.brandAccess.assert(user, brandId);
    // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one subscriber of this brand inside its organization.
    const removed = await this.prisma.brandSubscriber.updateMany({
      data: { confirmTokenHash: null, isDeleted: true },
      where: scopedWhere(user.organizationId, { brandId, id: subscriberId }),
    });
    if (removed.count === 0)
      throw new NotFoundException('Subscriber', subscriberId);
  }

  async resendConfirmation(
    user: AuthenticatedUser,
    brandId: string,
    subscriberId: string,
  ): Promise<void> {
    await this.brandAccess.assert(user, brandId);
    const subscriber = await this.prisma.brandSubscriber.findFirst({
      where: scopedWhere(user.organizationId, { brandId, id: subscriberId }),
    });
    if (!subscriber) throw new NotFoundException('Subscriber', subscriberId);
    if (subscriber.status !== 'pending') {
      throw new BadRequestException(
        'Only pending subscribers need confirming.',
      );
    }
    await this.sendConfirmation(subscriber);
  }

  /**
   * The public form. The answer never reveals whether the address was
   * already subscribed; only the mailbox owner can confirm.
   */
  async subscribePublic(
    dto: PublicSubscribeDto,
    ipAddress: string | null,
  ): Promise<void> {
    // tenant-scope-ignore: a public form names its brand; the organization is read from the brand row.
    const brand = await this.prisma.brand.findFirst({
      select: { id: true, organizationId: true },
      where: { id: dto.brandId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Newsletter', dto.brandId);
    const orgId = brand.organizationId;
    const email = dto.email.trim().toLowerCase();
    const emailHash = subscriberEmailHash(email);
    const [existing, suppressed] = await Promise.all([
      // tenant-scope-ignore: a removed row is read too so a returning reader revives it; the organization filter stays.
      this.prisma.brandSubscriber.findFirst({
        where: { brandId: brand.id, emailHash, organizationId: orgId },
      }),
      // tenant-scope-ignore: bounce and complaint suppression follows an address across organizations.
      this.prisma.emailSuppression.findUnique({
        where: { recipientHash: emailHash },
      }),
    ]);
    if (suppressed) return;
    if (existing && !existing.isDeleted) {
      if (existing.status === 'active') return;
      if (existing.status === 'bounced' || existing.status === 'complained')
        return;
      if (
        existing.status === 'pending' &&
        existing.confirmSentAt &&
        Date.now() - existing.confirmSentAt.getTime() <
          CONFIRM_RESEND_COOLDOWN_MS
      ) {
        return;
      }
    }
    // A full list answers like every other public request: a different
    // response would tell a stranger whether an address is already listed.
    if (
      (!existing || existing.isDeleted) &&
      !(await this.usage.hasSubscriberCapacity(orgId, 1))
    ) {
      this.logger.warn('Newsletter sign-up skipped: subscriber limit reached', {
        brandId: brand.id,
        organizationId: orgId,
      });
      return;
    }
    const fields = {
      consentIp: ipAddress?.slice(0, 64) ?? null,
      consentMethod: 'double_opt_in',
      name: dto.name?.trim().slice(0, 120) || null,
      source: dto.source ?? 'profile',
      sourceRef: dto.sourceRef?.slice(0, 200) ?? null,
      status: 'pending',
    };
    let subscriber: BrandSubscriber | null;
    if (existing) {
      // sql-risk-audit: ignore bulk-write-tenant-review -- pins one subscriber of this brand inside its organization.
      // tenant-scope-ignore: revives a removed row, so isDeleted is not filtered; the organization filter stays.
      await this.prisma.brandSubscriber.updateMany({
        data: { ...fields, isDeleted: false, unsubscribedAt: null },
        where: { id: existing.id, organizationId: orgId },
      });
      subscriber = await this.prisma.brandSubscriber.findFirst({
        where: scopedWhere(orgId, { id: existing.id }),
      });
    } else {
      subscriber = await this.prisma.brandSubscriber.create({
        data: {
          ...fields,
          brandId: brand.id,
          email,
          emailHash,
          organizationId: orgId,
        },
      });
    }
    if (subscriber) await this.sendConfirmation(subscriber);
  }

  /** Confirm a double opt-in. Returns the brand for the confirmation page. */
  async confirm(
    token: string,
  ): Promise<{ brandLabel: string; brandSlug: string } | null> {
    if (!CONFIRM_TOKEN_PATTERN.test(token)) return null;
    // tenant-scope-ignore: the unguessable confirmation token names one subscriber; its organization is read from the row.
    const subscriber = await this.prisma.brandSubscriber.findFirst({
      include: { brand: { select: { label: true, slug: true } } },
      where: { confirmTokenHash: confirmTokenHash(token), isDeleted: false },
    });
    if (
      subscriber?.status !== 'pending' ||
      !subscriber.confirmSentAt ||
      Date.now() - subscriber.confirmSentAt.getTime() > CONFIRM_TOKEN_TTL_MS
    ) {
      return null;
    }
    const now = new Date();
    // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one pending subscriber inside its organization.
    const updated = await this.prisma.brandSubscriber.updateMany({
      data: {
        confirmTokenHash: null,
        confirmedAt: now,
        consentAt: now,
        status: 'active',
      },
      where: scopedWhere(subscriber.organizationId, {
        id: subscriber.id,
        status: 'pending',
      }),
    });
    if (updated.count === 1) {
      await this.sendWelcome(subscriber).catch((error: unknown) =>
        this.logger.warn('Newsletter welcome email was not sent', {
          error: error instanceof Error ? error.message : 'unknown',
          subscriberId: subscriber.id,
        }),
      );
    }
    return {
      brandLabel: subscriber.brand.label,
      brandSlug: subscriber.brand.slug,
    };
  }

  private async write(
    user: AuthenticatedUser,
    brandId: string,
    parsed: ParsedSubscriberFile,
    options: {
      hasConsent: boolean;
      importId: string | null;
      isPreview: boolean;
      source: BrandSubscriberSource;
    },
  ): Promise<IBrandSubscriberImportSummary> {
    const orgId = user.organizationId;
    const classified = await this.classify(orgId, brandId, parsed.rows);
    const summary: IBrandSubscriberImportSummary = {
      added: classified.fresh.length,
      duplicate: classified.duplicate,
      importId: options.importId,
      invalid: parsed.invalid.length,
      invalidRows: parsed.invalid.slice(0, SUMMARY_SAMPLE_SIZE),
      isPreview: options.isPreview,
      pendingConfirmation: options.hasConsent ? 0 : classified.fresh.length,
      previewRows: parsed.rows.slice(0, SUMMARY_SAMPLE_SIZE).map((row) => ({
        email: row.email,
        name: row.name,
        tags: row.tags,
      })),
      suppressed: classified.suppressed,
      totalRows: parsed.rows.length + parsed.invalid.length,
    };
    if (options.isPreview || classified.fresh.length === 0) return summary;
    await this.usage.assertSubscriberCapacity(orgId, classified.fresh.length);

    const now = new Date();
    const status = options.hasConsent ? 'active' : 'pending';
    const shared = {
      brandId,
      consentAt: options.hasConsent ? now : null,
      consentMethod: options.hasConsent ? 'owner_attested' : 'double_opt_in',
      importId: options.importId,
      organizationId: orgId,
      source: options.source,
      status,
    };
    const toCreate = classified.fresh.filter(
      (row) => !classified.removedIds.has(subscriberEmailHash(row.email)),
    );
    for (let index = 0; index < toCreate.length; index += WRITE_CHUNK_SIZE) {
      await this.prisma.brandSubscriber.createMany({
        data: toCreate.slice(index, index + WRITE_CHUNK_SIZE).map((row) => ({
          ...shared,
          confirmedAt: options.hasConsent ? now : null,
          email: row.email,
          emailHash: subscriberEmailHash(row.email),
          name: row.name,
          tags: row.tags,
        })),
        skipDuplicates: true,
      });
    }
    for (const row of classified.fresh) {
      const removedId = classified.removedIds.get(
        subscriberEmailHash(row.email),
      );
      if (!removedId) continue;
      // sql-risk-audit: ignore bulk-write-tenant-review -- the predicate pins one removed subscriber of this brand inside its organization.
      await this.prisma.brandSubscriber.updateMany({
        data: {
          ...shared,
          confirmedAt: options.hasConsent ? now : null,
          isDeleted: false,
          name: row.name,
          tags: row.tags,
          unsubscribedAt: null,
        },
        where: {
          brandId,
          id: removedId,
          isDeleted: true,
          organizationId: orgId,
        },
      });
    }
    if (!options.hasConsent) {
      const pending = await this.prisma.brandSubscriber.findMany({
        where: scopedWhere(orgId, {
          brandId,
          confirmSentAt: null,
          emailHash: {
            in: classified.fresh.map((row) => subscriberEmailHash(row.email)),
          },
          status: 'pending',
        }),
      });
      for (const subscriber of pending) {
        await this.sendConfirmation(subscriber).catch((error: unknown) =>
          this.logger.warn('Newsletter confirmation email was not sent', {
            error: error instanceof Error ? error.message : 'unknown',
            subscriberId: subscriber.id,
          }),
        );
      }
    }
    return summary;
  }

  /** Split rows into new, duplicate (already listed) and suppressed. */
  private async classify(
    organizationId: string,
    brandId: string,
    rows: ParsedSubscriberRow[],
  ): Promise<ClassifiedRows> {
    const seen = new Set<string>();
    const unique: ParsedSubscriberRow[] = [];
    let duplicate = 0;
    for (const row of rows) {
      if (seen.has(row.email)) {
        duplicate += 1;
      } else {
        seen.add(row.email);
        unique.push(row);
      }
    }
    const existing = new Map<
      string,
      { id: string; isDeleted: boolean; status: string }
    >();
    const suppressedHashes = new Set<string>();
    for (let index = 0; index < unique.length; index += WRITE_CHUNK_SIZE) {
      const hashes = unique
        .slice(index, index + WRITE_CHUNK_SIZE)
        .map((row) => subscriberEmailHash(row.email));
      const [subscribers, suppressions] = await Promise.all([
        // tenant-scope-ignore: removed rows are read too so their address can be added back; the organization filter stays.
        this.prisma.brandSubscriber.findMany({
          select: { emailHash: true, id: true, isDeleted: true, status: true },
          take: WRITE_CHUNK_SIZE,
          where: { brandId, emailHash: { in: hashes }, organizationId },
        }),
        // tenant-scope-ignore: bounce and complaint suppression follows an address across organizations.
        this.prisma.emailSuppression.findMany({
          select: { recipientHash: true },
          where: { recipientHash: { in: hashes } },
        }),
      ]);
      for (const subscriber of subscribers) {
        existing.set(subscriber.emailHash, subscriber);
      }
      for (const suppression of suppressions) {
        suppressedHashes.add(suppression.recipientHash);
      }
    }
    const fresh: ParsedSubscriberRow[] = [];
    const removedIds = new Map<string, string>();
    let suppressed = 0;
    for (const row of unique) {
      const hash = subscriberEmailHash(row.email);
      const current = existing.get(hash);
      if (
        suppressedHashes.has(hash) ||
        (current && BLOCKED.has(current.status))
      ) {
        suppressed += 1;
      } else if (current && !current.isDeleted) {
        duplicate += 1;
      } else {
        if (current) removedIds.set(hash, current.id);
        fresh.push(row);
      }
    }
    return { duplicate, fresh, removedIds, suppressed };
  }

  private async sendConfirmation(subscriber: BrandSubscriber): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = confirmTokenHash(token);
    const sentAt = new Date();
    // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one subscriber inside its organization.
    await this.prisma.brandSubscriber.updateMany({
      data: { confirmSentAt: sentAt, confirmTokenHash: tokenHash },
      where: scopedWhere(subscriber.organizationId, { id: subscriber.id }),
    });
    const look = await this.emails.getBrandLook(
      subscriber.organizationId,
      subscriber.brandId,
    );
    const name = look.brand.label;
    const template = this.emails.renderMessage(look, {
      cta: {
        label: 'Confirm subscription',
        url: this.emails.confirmUrl(token),
      },
      markdown: `Please confirm you want to receive **${name}** by email. If you did not ask for this, ignore this message and you will not hear from us again.`,
      title: `Confirm your subscription to ${name}`,
    });
    const filled = this.emails.personalizeForSubscriber(
      template,
      subscriber.id,
    );
    await this.emails.deliver({
      html: filled.html,
      idempotencyKey: `newsletter-confirm/${subscriber.id}/${tokenHash.slice(0, 16)}`,
      look,
      subject: `Confirm your subscription to ${name}`,
      text: filled.text,
      to: subscriber.email,
    });
  }

  private async sendWelcome(subscriber: BrandSubscriber): Promise<void> {
    const look = await this.emails.getBrandLook(
      subscriber.organizationId,
      subscriber.brandId,
    );
    const body = look.settings.welcomeBody?.trim();
    if (!look.settings.isWelcomeEnabled || !body) return;
    const subject =
      look.settings.welcomeSubject?.trim() || `Welcome to ${look.brand.label}`;
    const template = this.emails.renderMessage(look, {
      markdown: body,
      title: subject,
    });
    const filled = this.emails.personalizeForSubscriber(
      template,
      subscriber.id,
    );
    await this.emails.deliver({
      html: filled.html,
      idempotencyKey: `newsletter-welcome/${subscriber.id}`,
      look,
      subject,
      text: filled.text,
      to: subscriber.email,
      unsubscribeUrl: filled.unsubscribeUrl,
    });
  }
}
