import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { NewsletterSendStatus } from '@genfeedai/contracts/constants';
import type {
  INewsletterActivityItem,
  INewsletterAnalytics,
  INewsletterGrowthPoint,
  INewsletterLinkReport,
  INewsletterSendReport,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const TOP_LINK_LIMIT = 10;
const ACTIVITY_LIMIT = 20;

interface SendAggregateRow {
  sendId: string;
  sent: bigint;
  delivered: bigint;
  uniqueOpens: bigint;
  totalOpens: bigint | null;
  uniqueClicks: bigint;
  totalClicks: bigint | null;
  bounced: bigint;
  complained: bigint;
  unsubscribed: bigint;
}

interface LinkAggregateRow {
  sendId: string;
  linkIndex: number;
  totalClicks: bigint;
  uniqueClicks: bigint;
}

interface DayCountRow {
  day: Date;
  count: bigint;
}

function toNumber(value: bigint | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10_000) / 10_000 : 0;
}

/**
 * The Newsletter Analytics page (#9727). Every number is read from stored
 * rows: provider receipts on recipients, first-party clicks, and subscriber
 * timestamps. Nothing here returns an address; readers are counted, not named.
 */
@Traced()
@Injectable()
export class NewsletterAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
  ) {}

  async get(
    user: AuthenticatedUser,
    brandId: string,
    range: { from?: string; to?: string },
  ): Promise<INewsletterAnalytics> {
    await this.brandAccess.assert(user, brandId);
    const orgId = user.organizationId;
    const to = range.to ? new Date(range.to) : new Date();
    const from = range.from
      ? new Date(range.from)
      : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
    if (from > to || to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException('Pick a range of at most one year.');
    }

    const sends = await this.prisma.newsletterSend.findMany({
      orderBy: { scheduledFor: 'desc' },
      select: {
        completedAt: true,
        id: true,
        links: true,
        newsletterId: true,
        recipientCount: true,
        scheduledFor: true,
        startedAt: true,
        status: true,
        subject: true,
      },
      where: scopedWhere(orgId, {
        brandId,
        scheduledFor: { gte: from, lte: to },
      }),
    });
    const sendIds = sends.map((send) => send.id);
    const [
      aggregates,
      linkRows,
      subscribed,
      unsubscribed,
      sources,
      audience,
      activity,
    ] = await Promise.all([
      this.aggregateSends(orgId, sendIds),
      this.aggregateLinks(orgId, sendIds),
      this.countByDay(orgId, brandId, 'confirmedAt', from, to),
      this.countByDay(orgId, brandId, 'unsubscribedAt', from, to),
      this.prisma.brandSubscriber.groupBy({
        _count: { _all: true },
        by: ['source'],
        where: scopedWhere(orgId, {
          brandId,
          confirmedAt: { gte: from, lte: to },
        }),
      }),
      this.prisma.brandSubscriber.groupBy({
        _count: { _all: true },
        by: ['status'],
        where: scopedWhere(orgId, { brandId }),
      }),
      this.recentActivity(orgId, brandId, sends),
    ]);

    const reports: INewsletterSendReport[] = sends.map((send) => {
      const row = aggregates.get(send.id);
      return {
        bounced: toNumber(row?.bounced),
        completedAt: send.completedAt?.toISOString() ?? null,
        complained: toNumber(row?.complained),
        delivered: toNumber(row?.delivered),
        id: send.id,
        newsletterId: send.newsletterId,
        recipientCount: send.recipientCount,
        scheduledFor: send.scheduledFor.toISOString(),
        sent: toNumber(row?.sent),
        startedAt: send.startedAt?.toISOString() ?? null,
        status: send.status as NewsletterSendStatus,
        subject: send.subject,
        totalClicks: toNumber(row?.totalClicks),
        totalOpens: toNumber(row?.totalOpens),
        uniqueClicks: toNumber(row?.uniqueClicks),
        uniqueOpens: toNumber(row?.uniqueOpens),
        unsubscribed: toNumber(row?.unsubscribed),
      };
    });

    const sendById = new Map(sends.map((send) => [send.id, send]));
    const topLinks: INewsletterLinkReport[] = linkRows
      .map((row) => {
        const send = sendById.get(row.sendId);
        const links = Array.isArray(send?.links) ? send.links : [];
        const url = links[row.linkIndex];
        return {
          index: row.linkIndex,
          sendId: row.sendId,
          subject: send?.subject ?? '',
          totalClicks: toNumber(row.totalClicks),
          uniqueClicks: toNumber(row.uniqueClicks),
          url: typeof url === 'string' ? url : '',
        };
      })
      .filter((link) => link.url)
      .slice(0, TOP_LINK_LIMIT);

    const sum = (pick: (report: INewsletterSendReport) => number) =>
      reports.reduce((total, report) => total + pick(report), 0);
    const delivered = sum((report) => report.delivered);
    const uniqueOpens = sum((report) => report.uniqueOpens);
    const uniqueClicks = sum((report) => report.uniqueClicks);
    const audienceCount = (status: string) =>
      audience.find((group) => group.status === status)?._count._all ?? 0;

    return {
      from: from.toISOString(),
      growth: this.growthSeries(from, to, subscribed, unsubscribed),
      recentActivity: activity,
      sends: reports,
      sources: sources
        .map((group) => ({ count: group._count._all, source: group.source }))
        .sort((left, right) => right.count - left.count),
      to: to.toISOString(),
      topLinks,
      totals: {
        activeSubscribers: audienceCount('active'),
        bounced: sum((report) => report.bounced),
        clickRate: ratio(uniqueClicks, delivered),
        complained: sum((report) => report.complained),
        delivered,
        openRate: ratio(uniqueOpens, delivered),
        sends: reports.length,
        sent: sum((report) => report.sent),
        subscribers: audience.reduce(
          (total, group) => total + group._count._all,
          0,
        ),
        uniqueClicks,
        uniqueOpens,
        unsubscribed: sum((report) => report.unsubscribed),
      },
    };
  }

  private async aggregateSends(
    orgId: string,
    sendIds: string[],
  ): Promise<Map<string, SendAggregateRow>> {
    if (sendIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<SendAggregateRow[]>`
      SELECT
        r."sendId",
        COUNT(*) FILTER (WHERE r."status" = 'sent') AS "sent",
        COUNT(r."deliveredAt") AS "delivered",
        COUNT(r."openedAt") AS "uniqueOpens",
        SUM(r."openCount") AS "totalOpens",
        COUNT(r."clickedAt") AS "uniqueClicks",
        SUM(r."clickCount") AS "totalClicks",
        COUNT(r."bouncedAt") AS "bounced",
        COUNT(r."complainedAt") AS "complained",
        COUNT(r."unsubscribedAt") AS "unsubscribed"
      FROM "newsletter_send_recipients" AS r
      WHERE r."organizationId" = ${orgId}
        AND r."isDeleted" = false
        AND r."sendId" IN (${Prisma.join(sendIds)})
      GROUP BY r."sendId"
    `;
    return new Map(rows.map((row) => [row.sendId, row]));
  }

  private aggregateLinks(
    orgId: string,
    sendIds: string[],
  ): Promise<LinkAggregateRow[]> {
    if (sendIds.length === 0) return Promise.resolve([]);
    return this.prisma.$queryRaw<LinkAggregateRow[]>`
      SELECT
        c."sendId",
        c."linkIndex",
        COUNT(*) AS "totalClicks",
        COUNT(DISTINCT c."recipientId") AS "uniqueClicks"
      FROM "newsletter_link_clicks" AS c
      WHERE c."organizationId" = ${orgId}
        AND c."isDeleted" = false
        AND c."sendId" IN (${Prisma.join(sendIds)})
      GROUP BY c."sendId", c."linkIndex"
      ORDER BY "uniqueClicks" DESC, "totalClicks" DESC
      LIMIT ${TOP_LINK_LIMIT * 5}
    `;
  }

  private countByDay(
    orgId: string,
    brandId: string,
    column: 'confirmedAt' | 'unsubscribedAt',
    from: Date,
    to: Date,
  ): Promise<DayCountRow[]> {
    const field = Prisma.raw(`"${column}"`);
    return this.prisma.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', s.${field}) AS "day", COUNT(*) AS "count"
      FROM "brand_subscribers" AS s
      WHERE s."organizationId" = ${orgId}
        AND s."brandId" = ${brandId}
        AND s."isDeleted" = false
        AND s.${field} >= ${from}
        AND s.${field} <= ${to}
      GROUP BY 1
    `;
  }

  private growthSeries(
    from: Date,
    to: Date,
    subscribed: DayCountRow[],
    unsubscribed: DayCountRow[],
  ): INewsletterGrowthPoint[] {
    const added = new Map(
      subscribed.map((row) => [dayKey(row.day), toNumber(row.count)]),
    );
    const lost = new Map(
      unsubscribed.map((row) => [dayKey(row.day), toNumber(row.count)]),
    );
    const points: INewsletterGrowthPoint[] = [];
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
    );
    while (cursor <= to) {
      const key = dayKey(cursor);
      const day = {
        subscribed: added.get(key) ?? 0,
        unsubscribed: lost.get(key) ?? 0,
      };
      points.push({
        date: key,
        ...day,
        net: day.subscribed - day.unsubscribed,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return points;
  }

  private async recentActivity(
    orgId: string,
    brandId: string,
    sends: { id: string; subject: string }[],
  ): Promise<INewsletterActivityItem[]> {
    const subjectBySend = new Map(sends.map((send) => [send.id, send.subject]));
    const sendIds = sends.map((send) => send.id);
    const [joined, left, opened, clicked, bounced] = await Promise.all([
      this.prisma.brandSubscriber.findMany({
        orderBy: { confirmedAt: 'desc' },
        select: { confirmedAt: true },
        take: ACTIVITY_LIMIT,
        where: scopedWhere(orgId, { brandId, confirmedAt: { not: null } }),
      }),
      this.prisma.brandSubscriber.findMany({
        orderBy: { unsubscribedAt: 'desc' },
        select: { unsubscribedAt: true },
        take: ACTIVITY_LIMIT,
        where: scopedWhere(orgId, { brandId, unsubscribedAt: { not: null } }),
      }),
      this.prisma.newsletterSendRecipient.findMany({
        orderBy: { openedAt: 'desc' },
        select: { openedAt: true, sendId: true },
        take: ACTIVITY_LIMIT,
        where: scopedWhere(orgId, {
          openedAt: { not: null },
          sendId: { in: sendIds },
        }),
      }),
      this.prisma.newsletterLinkClick.findMany({
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true, sendId: true },
        take: ACTIVITY_LIMIT,
        where: scopedWhere(orgId, { sendId: { in: sendIds } }),
      }),
      this.prisma.newsletterSendRecipient.findMany({
        orderBy: { bouncedAt: 'desc' },
        select: { bouncedAt: true, sendId: true },
        take: ACTIVITY_LIMIT,
        where: scopedWhere(orgId, {
          bouncedAt: { not: null },
          sendId: { in: sendIds },
        }),
      }),
    ]);
    const items: {
      type: INewsletterActivityItem['type'];
      at: Date | null;
      sendId?: string;
    }[] = [
      ...joined.map((row) => ({
        at: row.confirmedAt,
        type: 'subscribed' as const,
      })),
      ...left.map((row) => ({
        at: row.unsubscribedAt,
        type: 'unsubscribed' as const,
      })),
      ...opened.map((row) => ({
        at: row.openedAt,
        sendId: row.sendId,
        type: 'opened' as const,
      })),
      ...clicked.map((row) => ({
        at: row.occurredAt,
        sendId: row.sendId,
        type: 'clicked' as const,
      })),
      ...bounced.map((row) => ({
        at: row.bouncedAt,
        sendId: row.sendId,
        type: 'bounced' as const,
      })),
    ];
    return items
      .filter((item): item is typeof item & { at: Date } => item.at !== null)
      .sort((left, right) => right.at.getTime() - left.at.getTime())
      .slice(0, ACTIVITY_LIMIT)
      .map((item) => ({
        occurredAt: item.at.toISOString(),
        subject: item.sendId ? (subjectBySend.get(item.sendId) ?? null) : null,
        type: item.type,
      }));
  }
}
