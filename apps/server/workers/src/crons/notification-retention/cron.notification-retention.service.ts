import { NotificationDeliveryStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import {
  NOTIFICATION_DELIVERY_RETENTION_DAYS,
  NOTIFICATION_EVENT_RETENTION_DAYS,
  NOTIFICATION_INBOX_MAX_RETENTION_DAYS,
  NOTIFICATION_INBOX_READ_RETENTION_DAYS,
  NOTIFICATION_RETENTION_BATCH_SIZE,
  NOTIFICATION_RETENTION_MAX_BATCHES,
} from '@workers/crons/notification-retention/notification-retention.constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type NotificationRetentionTotals = {
  deliveries: number;
  events: number;
  inboxItems: number;
};

/**
 * Deletes notification rows that are past their retention window.
 *
 * Nothing deleted these tables before (#10384). The order matters: inbox items
 * and deliveries reference their event, so they go first and an event goes only
 * once nothing references it. A delivery with a tracked `EmailMessage` is kept:
 * that row owns the email performance record (opens, clicks, conversions).
 *
 * The windows are platform policy, not tenant data access, so the sweeps are
 * global by design.
 */
@Injectable()
export class CronNotificationRetentionService {
  private readonly context = 'CronNotificationRetentionService';

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  async purgeExpiredNotifications(
    now = new Date(),
  ): Promise<NotificationRetentionTotals> {
    // Order matters: inbox items and deliveries reference their event.
    const inboxItems = await this.purgeInboxItems(now);
    const deliveries = await this.purgeDeliveries(now);
    const events = await this.purgeEvents(now);
    const totals = { deliveries, events, inboxItems };

    this.logger.log('CronNotificationRetentionService completed', {
      ...totals,
      context: this.context,
    });

    return totals;
  }

  static cutoffFrom(now: Date, days: number): Date {
    return new Date(now.getTime() - days * MS_PER_DAY);
  }

  private async purgeInboxItems(now: Date): Promise<number> {
    const readCutoff = CronNotificationRetentionService.cutoffFrom(
      now,
      NOTIFICATION_INBOX_READ_RETENTION_DAYS,
    );
    const maxCutoff = CronNotificationRetentionService.cutoffFrom(
      now,
      NOTIFICATION_INBOX_MAX_RETENTION_DAYS,
    );
    const expired = {
      OR: [{ readAt: { lt: readCutoff } }, { occurredAt: { lt: maxCutoff } }],
    };

    return drainInBatches(
      // tenant-scope-ignore: retention is a platform-wide age window; it reads no tenant data and returns ids only.
      () =>
        this.prisma.notificationInboxItem.findMany({
          orderBy: { id: 'asc' },
          select: { id: true },
          take: NOTIFICATION_RETENTION_BATCH_SIZE,
          where: expired,
        }),
      // tenant-scope-ignore: retention is a platform-wide age window; the ids were selected by that window.
      // sql-risk-audit: ignore bulk-write-tenant-review -- Platform-wide retention of notification inbox items by age; the predicate is re-applied to the selected ids.
      (ids) =>
        this.prisma.notificationInboxItem.deleteMany({
          where: { ...expired, id: { in: ids } },
        }),
    );
  }

  private async purgeDeliveries(now: Date): Promise<number> {
    const cutoff = CronNotificationRetentionService.cutoffFrom(
      now,
      NOTIFICATION_DELIVERY_RETENTION_DAYS,
    );
    const expired = {
      createdAt: { lt: cutoff },
      emailMessage: { is: null },
      status: {
        in: [
          NotificationDeliveryStatus.DELIVERED,
          NotificationDeliveryStatus.SKIPPED,
          NotificationDeliveryStatus.FAILED,
        ],
      },
    };

    return drainInBatches(
      // tenant-scope-ignore: retention is a platform-wide age window; it reads no tenant data and returns ids only.
      () =>
        this.prisma.notificationDelivery.findMany({
          orderBy: { id: 'asc' },
          select: { id: true },
          take: NOTIFICATION_RETENTION_BATCH_SIZE,
          where: expired,
        }),
      // tenant-scope-ignore: retention is a platform-wide age window; the ids were selected by that window.
      // sql-risk-audit: ignore bulk-write-tenant-review -- Platform-wide retention of notification deliveries in a final state by age; the predicate is re-applied to the selected ids.
      (ids) =>
        this.prisma.notificationDelivery.deleteMany({
          where: { ...expired, id: { in: ids } },
        }),
    );
  }

  private async purgeEvents(now: Date): Promise<number> {
    const cutoff = CronNotificationRetentionService.cutoffFrom(
      now,
      NOTIFICATION_EVENT_RETENTION_DAYS,
    );
    const expired = {
      deliveries: { none: {} },
      inboxItems: { none: {} },
      occurredAt: { lt: cutoff },
    };

    return drainInBatches(
      // tenant-scope-ignore: retention is a platform-wide age window; it reads no tenant data and returns ids only.
      () =>
        this.prisma.notificationEvent.findMany({
          orderBy: { id: 'asc' },
          select: { id: true },
          take: NOTIFICATION_RETENTION_BATCH_SIZE,
          where: expired,
        }),
      // tenant-scope-ignore: retention is a platform-wide age window; the ids were selected by that window.
      // sql-risk-audit: ignore bulk-write-tenant-review -- Platform-wide retention of notification events by age once unreferenced; the predicate is re-applied to the selected ids.
      (ids) =>
        this.prisma.notificationEvent.deleteMany({
          where: { ...expired, id: { in: ids } },
        }),
    );
  }
}

/**
 * Selects a page of ids, deletes exactly those rows, and repeats until a page
 * comes back short, deletes nothing (concurrent change made the page
 * ineligible), or the per-run batch cap is reached.
 */
async function drainInBatches(
  selectPage: () => Promise<Array<{ id: string }>>,
  deletePage: (ids: string[]) => Promise<{ count: number }>,
): Promise<number> {
  let deleted = 0;
  for (let batch = 0; batch < NOTIFICATION_RETENTION_MAX_BATCHES; batch++) {
    const rows = await selectPage();
    if (rows.length === 0) break;
    const result = await deletePage(rows.map((row) => row.id));
    deleted += result.count;
    if (result.count === 0 || rows.length < NOTIFICATION_RETENTION_BATCH_SIZE)
      break;
  }
  return deleted;
}
