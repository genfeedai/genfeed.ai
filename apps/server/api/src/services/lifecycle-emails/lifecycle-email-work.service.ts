import {
  EMAIL_CONVERSION_ACCEPTED_LOOKBACK_MS,
  EMAIL_SIGNAL_DEFAULT_LOOKBACK_MS,
  EMAIL_SIGNAL_STREAMS,
} from '@api/services/email-product-signals/email-product-signals.workflow';
import { LowCreditThresholdService } from '@api/services/low-credit-threshold/low-credit-threshold.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import { IngredientStatus } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
import { FreeTrialEmailsService } from './free-trial-emails.service';
import { completedEmailPeriod } from './lifecycle-email-period.util';
import { GENERATED_CONTENT_FILTER } from './system-email-eligibility.service';

const PAGE_SIZE = 500;
const DAY_MS = 86_400_000;
/** Every Stripe-backed credit grant namespaces its ledger reference with this. */
export const PAID_CREDIT_REFERENCE_PREFIX = 'stripe-';
const RECEIPT_REFERENCE_PREFIX = 'stripe-checkout-session:';

function readOrganizationId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const organizationId = (metadata as Record<string, unknown>).organizationId;
  return typeof organizationId === 'string' && organizationId
    ? organizationId
    : null;
}

/**
 * Decides which organizations the hourly system-email sweep runs for, so an
 * organization with nothing to send costs no queue job and no execution row.
 *
 * Every source mirrors the check its per-organization step performs, and
 * deliberately over-selects: a step still re-validates before it sends. A
 * source must never under-select, or its email silently stops for an idle
 * organization. Inactive users are not filtered out: a due win-back, trial
 * notice or credit reminder is exactly the email an idle organization needs.
 */
@Injectable()
export class LifecycleEmailWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freeTrialEmails: FreeTrialEmailsService,
    private readonly lowCreditThreshold: LowCreditThresholdService,
  ) {}

  async findOrganizationIds(now: Date): Promise<string[]> {
    const sources = await Promise.all([
      this.dueDeliveries(now),
      this.newGenerations(now),
      this.newPurchases(now),
      this.recentAcceptedMessages(now),
      this.recapContent(now),
      this.freeTrialEmails.findNoticeWindowOrganizationIds(now),
      this.creditAlerts(),
    ]);
    return [...new Set(sources.flat())].sort();
  }

  /** Scheduled or failed deliveries whose time has come (`recover`). */
  private async dueDeliveries(now: Date): Promise<string[]> {
    const organizationIds = new Set<string>();
    let cursor: string | undefined;
    while (true) {
      const due = await this.prisma.lifecycleEmailDelivery.findMany({
        where: {
          status: { in: ['scheduled', 'failed'] },
          scheduledFor: { lte: now },
        },
        select: { id: true, metadata: true, userId: true },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
      });
      const unowned = new Set<string>();
      for (const row of due) {
        const organizationId = readOrganizationId(row.metadata);
        if (organizationId) organizationIds.add(organizationId);
        else unowned.add(row.userId);
      }
      if (unowned.size) {
        // tenant-scope-ignore: resolves each recipient's canonical (oldest) organization exactly as recover does, so one tenant claims an org-less delivery; identifiers only.
        const memberships = await this.prisma.member.findMany({
          where: {
            userId: { in: [...unowned] },
            isDeleted: false,
            isActive: true,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { organizationId: true, userId: true },
        });
        const claimed = new Set<string>();
        for (const membership of memberships) {
          if (claimed.has(membership.userId)) continue;
          claimed.add(membership.userId);
          organizationIds.add(membership.organizationId);
        }
      }
      if (due.length < PAGE_SIZE) return [...organizationIds];
      cursor = due[due.length - 1].id;
    }
  }

  /** Long-generation updates: generations finished since the checkpoint. */
  private async newGenerations(now: Date): Promise<string[]> {
    const floor = new Date(now.getTime() - EMAIL_SIGNAL_DEFAULT_LOOKBACK_MS);
    // tenant-scope-ignore: platform-wide discovery groups by organization to find work; the per-organization step re-reads under its own scope.
    const finished = await this.prisma.ingredient.groupBy({
      by: ['organizationId'],
      where: {
        isDeleted: false,
        parentId: null,
        status: { in: [IngredientStatus.GENERATED, IngredientStatus.FAILED] },
        // Rows are created before they complete; the lower bound keeps the
        // scan on the (isDeleted, createdAt) index.
        createdAt: { gte: new Date(floor.getTime() - DAY_MS) },
        generationCompletedAt: { gte: floor, lte: now },
      },
      _max: { generationCompletedAt: true },
    });
    return this.pastCheckpoint(
      EMAIL_SIGNAL_STREAMS.GENERATION,
      finished.map((row) => ({
        organizationId: row.organizationId,
        at: row._max.generationCompletedAt,
      })),
    );
  }

  /** Purchase receipts: checkout credits granted since the checkpoint. */
  private async newPurchases(now: Date): Promise<string[]> {
    const floor = new Date(now.getTime() - EMAIL_SIGNAL_DEFAULT_LOOKBACK_MS);
    // tenant-scope-ignore: platform-wide discovery groups by organization to find work; the per-organization step re-reads under its own scope.
    const purchases = await this.prisma.creditTransaction.groupBy({
      by: ['organizationId'],
      where: {
        isDeleted: false,
        category: CreditTransactionCategory.ADD,
        amount: { gt: 0 },
        referenceType: { startsWith: RECEIPT_REFERENCE_PREFIX },
        createdAt: { gte: floor, lt: now },
      },
      _max: { createdAt: true },
    });
    return this.pastCheckpoint(
      EMAIL_SIGNAL_STREAMS.RECEIPT,
      purchases.map((row) => ({
        organizationId: row.organizationId,
        at: row._max.createdAt,
      })),
    );
  }

  /** Conversion attribution: goal-tagged messages that can still convert. */
  private async recentAcceptedMessages(now: Date): Promise<string[]> {
    const since = new Date(
      now.getTime() - EMAIL_CONVERSION_ACCEPTED_LOOKBACK_MS,
    );
    // tenant-scope-ignore: platform-wide discovery groups by organization to find work; the per-organization step re-reads under its own scope.
    const messages = await this.prisma.emailMessage.groupBy({
      by: ['organizationId'],
      where: {
        isDeleted: false,
        goal: { not: null },
        // A message is created before it is accepted; the lower bound keeps
        // the scan on the (createdAt, templateKey) index.
        createdAt: { gte: new Date(since.getTime() - DAY_MS) },
        acceptedAt: { gte: since, lte: now },
      },
      _count: { _all: true },
    });
    return messages.flatMap((row) =>
      row.organizationId ? [row.organizationId] : [],
    );
  }

  /**
   * Daily and weekly recaps and the connection reminder read content finished
   * since the start of the last completed week.
   */
  private async recapContent(now: Date): Promise<string[]> {
    const since = completedEmailPeriod(now, true).start;
    const [ingredients, articles] = await Promise.all([
      // tenant-scope-ignore: platform-wide discovery groups by organization to find work; the per-organization step re-reads under its own scope.
      this.prisma.ingredient.groupBy({
        by: ['organizationId'],
        where: {
          ...GENERATED_CONTENT_FILTER,
          createdAt: { gte: new Date(since.getTime() - DAY_MS) },
          generationCompletedAt: { gte: since },
        },
        _count: { _all: true },
      }),
      // tenant-scope-ignore: platform-wide discovery groups by organization to find work; the per-organization step re-reads under its own scope.
      this.prisma.article.groupBy({
        by: ['organizationId'],
        where: { isDeleted: false, generationCompletedAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    return [...ingredients, ...articles].flatMap((row) =>
      row.organizationId ? [row.organizationId] : [],
    );
  }

  /**
   * Low or exhausted balances of organizations that have paid. The cooldown
   * is left to the credit step, so an organization that stays low is run
   * hourly but sends at most one alert a week.
   */
  private async creditAlerts(): Promise<string[]> {
    // tenant-scope-ignore: platform-wide discovery selects paying organization identifiers only; the credit step re-reads under its own scope.
    const paying = await this.prisma.organization.findMany({
      where: {
        isDeleted: false,
        creditTransactions: {
          some: {
            isDeleted: false,
            amount: { gt: 0 },
            referenceId: { not: null },
            referenceType: { startsWith: PAID_CREDIT_REFERENCE_PREFIX },
          },
        },
      },
      select: { id: true },
    });
    const alerting: string[] = [];
    for (let offset = 0; offset < paying.length; offset += PAGE_SIZE) {
      const ids = paying.slice(offset, offset + PAGE_SIZE).map(({ id }) => id);
      // tenant-scope-ignore: bulk read of the paying organizations' balances; the credit step re-reads under its own scope.
      const balances = await this.prisma.creditBalance.findMany({
        where: { organizationId: { in: ids }, isDeleted: false },
        select: { balance: true, heldAmount: true, organizationId: true },
      });
      for (const { balance, heldAmount, organizationId } of balances) {
        if (!organizationId) continue;
        const spendable = balance - heldAmount;
        if (spendable <= 0) {
          alerting.push(organizationId);
          continue;
        }
        const { threshold } =
          await this.lowCreditThreshold.resolve(organizationId);
        if (threshold !== null && spendable < threshold) {
          alerting.push(organizationId);
        }
      }
    }
    return alerting;
  }

  /** Organizations whose newest event is at or after their stream checkpoint. */
  private async pastCheckpoint(
    stream: string,
    events: Array<{ organizationId: string | null; at: Date | null }>,
  ): Promise<string[]> {
    const candidates = events.filter(
      (event): event is { organizationId: string; at: Date } =>
        event.organizationId !== null && event.at !== null,
    );
    const scannedThrough = new Map<string, Date>();
    for (let offset = 0; offset < candidates.length; offset += PAGE_SIZE) {
      // tenant-scope-ignore: bulk checkpoint read for the candidate organizations; compound checkpoint identity includes the organization.
      const checkpoints = await this.prisma.emailSignalCheckpoint.findMany({
        where: {
          isDeleted: false,
          organizationId: {
            in: candidates
              .slice(offset, offset + PAGE_SIZE)
              .map(({ organizationId }) => organizationId),
          },
          stream,
        },
        select: { organizationId: true, scannedThrough: true },
      });
      for (const checkpoint of checkpoints) {
        scannedThrough.set(
          checkpoint.organizationId,
          checkpoint.scannedThrough,
        );
      }
    }
    return candidates
      .filter(({ organizationId, at }) => {
        const checkpoint = scannedThrough.get(organizationId);
        return !checkpoint || at >= checkpoint;
      })
      .map(({ organizationId }) => organizationId);
  }
}
