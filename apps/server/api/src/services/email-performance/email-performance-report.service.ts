import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IEmailPerformanceQuery,
  IEmailPerformanceReport,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

const DAY_MS = 86_400_000;

@Injectable()
export class EmailPerformanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(
    query: IEmailPerformanceQuery,
  ): Promise<IEmailPerformanceReport> {
    const asOf = new Date();
    const to = query.to ? new Date(query.to) : asOf;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * DAY_MS);
    const duration = to.getTime() - from.getTime();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 90 * DAY_MS) {
      throw new BadRequestException(
        'Choose a valid date range of no more than 90 days.',
      );
    }

    const where = { createdAt: { gte: from, lt: to }, isDeleted: false };
    const [messages, conversions] = await this.prisma.$transaction([
      // tenant-scope-ignore: platform-wide operator aggregate; the only caller is admin/system-emails, gated by IpWhitelistGuard and SuperAdminGuard, and the result is grouped by template with no per-tenant rows.
      this.prisma.emailMessage.groupBy({
        by: ['templateKey'],
        where,
        _count: {
          _all: true,
          acceptedAt: true,
          deliveredAt: true,
          bouncedAt: true,
          complainedAt: true,
          openedAt: true,
          clickedAt: true,
        },
        orderBy: { templateKey: 'asc' },
      }),
      // tenant-scope-ignore: same platform-wide superadmin aggregate as above, narrowed to messages with a confirmed conversion.
      this.prisma.emailMessage.groupBy({
        by: ['templateKey'],
        where: {
          ...where,
          conversions: {
            some: { isDeleted: false, occurredAt: { lte: asOf } },
          },
        },
        _count: { _all: true },
      }),
    ]);
    const convertedByTemplate = new Map(
      conversions.map((row) => [row.templateKey, row._count._all]),
    );

    return {
      id: `${from.toISOString()}_${to.toISOString()}`,
      from: from.toISOString(),
      to: to.toISOString(),
      asOf: asOf.toISOString(),
      rows: messages.map((row) => ({
        templateKey: row.templateKey,
        queued: row._count._all,
        accepted: row._count.acceptedAt,
        delivered: row._count.deliveredAt,
        bounced: row._count.bouncedAt,
        complained: row._count.complainedAt,
        opened: row._count.openedAt,
        clicked: row._count.clickedAt,
        converted: convertedByTemplate.get(row.templateKey) ?? 0,
      })),
    };
  }
}
