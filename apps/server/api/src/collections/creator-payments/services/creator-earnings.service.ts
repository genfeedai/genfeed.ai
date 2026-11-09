import { readCreditTransferMetadata } from '@api/collections/credits/services/credit-transfer-metadata.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  CreditTransactionCategory,
  CreditTransferKind,
} from '@genfeedai/contracts';
import { CREATOR_PAYMENT_REFERENCE_TYPE } from '@genfeedai/contracts/constants';
import type {
  ICreatorEarnings,
  ICreatorEarningsByArticle,
  ICreatorPaymentRow,
} from '@genfeedai/contracts/interfaces/billing';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** Recent payments listed on each side of the Earnings page. */
const RECENT_PAYMENTS = 50;
/**
 * Received rows scanned for the per-article breakdown, newest first. Article
 * ids live in row metadata, so this breakdown covers the latest rows only;
 * totals and the per-source split are exact aggregates.
 */
const ARTICLE_SCAN_LIMIT = 5000;
const TOP_ARTICLES = 10;

type LedgerRow = {
  amount: number;
  createdAt: Date;
  description: string | null;
  metadata: unknown;
  referenceId: string | null;
  source: string | null;
};

const LEDGER_ROW_SELECT = {
  amount: true,
  createdAt: true,
  description: true,
  metadata: true,
  referenceId: true,
  source: true,
} as const;

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Transfer rows record their kind as the row source. */
function transferKind(row: LedgerRow): CreditTransferKind {
  const fromMetadata = readCreditTransferMetadata(row.metadata)?.kind;
  return (
    fromMetadata ??
    Object.values(CreditTransferKind).find((kind) => kind === row.source) ??
    CreditTransferKind.TIP
  );
}

/**
 * One ledger row as a payment. The row's own amount is what moved on this
 * side (net for the creator, gross for the reader); the metadata carries the
 * full gross, fee and net split.
 */
function toPaymentRow(row: LedgerRow): ICreatorPaymentRow {
  const metadata = readCreditTransferMetadata(row.metadata);
  const grossAmount = metadata?.grossAmount ?? row.amount;
  const feeAmount = metadata?.feeAmount ?? 0;
  return {
    createdAt: row.createdAt.toISOString(),
    description: row.description ?? '',
    feeAmount,
    grossAmount,
    kind: transferKind(row),
    ...(metadata?.message ? { message: metadata.message } : {}),
    netAmount: metadata?.netAmount ?? grossAmount - feeAmount,
    transferId: row.referenceId ?? '',
  };
}

/**
 * The Earnings page (#9719): what an organization's creators earned and what
 * its members paid other creators, read from the credit transfer ledger rows
 * (never a separate counter).
 */
@Traced()
@Injectable()
export class CreatorEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEarnings(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<ICreatorEarnings> {
    const received = scopedWhere(organizationId, {
      category: CreditTransactionCategory.TRANSFER_IN,
      referenceType: CREATOR_PAYMENT_REFERENCE_TYPE,
    });
    const sent = scopedWhere(organizationId, {
      category: CreditTransactionCategory.TRANSFER_OUT,
      referenceType: CREATOR_PAYMENT_REFERENCE_TYPE,
    });

    const [wallet, total, month, sources, recentReceived, recentSent, scanned] =
      await Promise.all([
        this.prisma.creditBalance.findFirst({
          select: { earnedBalance: true },
          where: scopedWhere(organizationId, {}),
        }),
        this.prisma.creditTransaction.aggregate({
          _sum: { amount: true },
          where: received,
        }),
        this.prisma.creditTransaction.aggregate({
          _sum: { amount: true },
          where: { ...received, createdAt: { gte: startOfUtcMonth(now) } },
        }),
        this.prisma.creditTransaction.groupBy({
          _count: { _all: true },
          _sum: { amount: true },
          by: ['source'],
          where: received,
        }),
        this.prisma.creditTransaction.findMany({
          orderBy: { createdAt: 'desc' },
          select: LEDGER_ROW_SELECT,
          take: RECENT_PAYMENTS,
          where: received,
        }),
        this.prisma.creditTransaction.findMany({
          orderBy: { createdAt: 'desc' },
          select: LEDGER_ROW_SELECT,
          take: RECENT_PAYMENTS,
          where: sent,
        }),
        this.prisma.creditTransaction.findMany({
          orderBy: { createdAt: 'desc' },
          select: LEDGER_ROW_SELECT,
          take: ARTICLE_SCAN_LIMIT,
          where: received,
        }),
      ]);

    return {
      byArticle: await this.byArticle(organizationId, scanned),
      bySource: Object.values(CreditTransferKind).map((kind) => {
        const group = sources.find((entry) => entry.source === kind);
        return {
          count: group?._count._all ?? 0,
          kind,
          netAmount: group?._sum.amount ?? 0,
        };
      }),
      earnedBalance: wallet?.earnedBalance ?? 0,
      received: recentReceived.map(toPaymentRow),
      sent: recentSent.map(toPaymentRow),
      thisMonth: month._sum.amount ?? 0,
      totalEarned: total._sum.amount ?? 0,
    };
  }

  /** Payments that name one of the organization's own articles. */
  private async byArticle(
    organizationId: string,
    rows: LedgerRow[],
  ): Promise<ICreatorEarningsByArticle[]> {
    const totals = new Map<string, { count: number; netAmount: number }>();
    for (const row of rows) {
      const subjectId = readCreditTransferMetadata(row.metadata)?.subjectId;
      if (!subjectId) continue;
      const current = totals.get(subjectId) ?? { count: 0, netAmount: 0 };
      totals.set(subjectId, {
        count: current.count + 1,
        netAmount: current.netAmount + row.amount,
      });
    }
    if (totals.size === 0) {
      return [];
    }
    const articles = await this.prisma.article.findMany({
      select: { id: true, label: true },
      where: scopedWhere(organizationId, { id: { in: [...totals.keys()] } }),
    });
    return articles
      .map((article) => ({
        articleId: article.id,
        label: article.label,
        ...(totals.get(article.id) ?? { count: 0, netAmount: 0 }),
      }))
      .sort((left, right) => right.netAmount - left.netAmount)
      .slice(0, TOP_ARTICLES);
  }
}
