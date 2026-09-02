import { createHash } from 'node:crypto';
import type { AnalyzeListeningTopicDto } from '@api/collections/listening-topics/dto/analyze-listening-topic.dto';
import type { ListeningAnalysisQueryDto } from '@api/collections/listening-topics/dto/listening-topics-query.dto';
import type { ReviewListeningThemeDto } from '@api/collections/listening-topics/dto/review-listening-theme.dto';
import type {
  ListeningSignalDocument,
  ListeningThemeDocument,
} from '@api/collections/listening-topics/schemas/listening-topic.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type IListeningScope,
  LISTENING_ANALYSIS_METHODOLOGY_VERSION,
  type ListeningAnalysisResult,
  type ListeningInsufficiencyReason,
  type ListeningSignalType,
  type SourcePostMetrics,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

const MAX_WINDOW_MILLISECONDS = 31 * 24 * 60 * 60 * 1000;
const SIGNAL_TYPES: ListeningSignalType[] = [
  'volume',
  'change',
  'sentiment_direction',
  'comparative',
];

type AnalysisTopic = {
  brandId: string;
  id: string;
  keywords: string[];
  organizationId: string;
  sources: Array<{ sourceId: string }>;
};

type AnalysisEvidence = {
  brandId: string;
  collectedAt: Date;
  contentExcerpt?: string | null;
  freshnessExpiresAt: Date;
  id: string;
  isDeleted: boolean;
  metrics: SourcePostMetrics;
  occurredAt: Date;
  organizationId: string;
  topicId: string;
  topicSource: { sourceId: string };
};

type AnalysisWindow = {
  currentEnd: Date;
  currentStart: Date;
  minimumEvidence: number;
  previousEnd: Date;
  previousStart: Date;
};

type EvidenceCluster = {
  clusterKey: string;
  evidence: AnalysisEvidence[];
  label: string;
};

type PersistenceDelegate = {
  count?: (args: Record<string, unknown>) => Promise<number>;
  findFirst?: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
  findMany?: (args: Record<string, unknown>) => Promise<unknown[]>;
  updateMany?: (args: Record<string, unknown>) => Promise<unknown>;
  upsert?: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type AnalysisTransaction = {
  listeningSignal: Required<Pick<PersistenceDelegate, 'updateMany' | 'upsert'>>;
  listeningTheme: Required<Pick<PersistenceDelegate, 'updateMany' | 'upsert'>>;
  listeningThemeEvidence: {
    createMany: (args: Record<string, unknown>) => Promise<unknown>;
    deleteMany: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

type ListeningAnalysisDatabase = {
  $transaction: <T>(
    callback: (transaction: AnalysisTransaction) => Promise<T>,
  ) => Promise<T>;
  listeningEvidence: {
    findMany: (args: Record<string, unknown>) => Promise<AnalysisEvidence[]>;
  };
  listeningSignal: Required<Pick<PersistenceDelegate, 'count' | 'findMany'>>;
  listeningTheme: Required<
    Pick<PersistenceDelegate, 'count' | 'findFirst' | 'findMany' | 'updateMany'>
  >;
  listeningTopic: {
    findFirst: (args: Record<string, unknown>) => Promise<AnalysisTopic | null>;
  };
};

type SignalCalculation = {
  confidence: number;
  evidenceIds: string[];
  excludedSourceIds: string[];
  includedSourceIds: string[];
  insufficiencyReason: ListeningInsufficiencyReason | null;
  signalType: ListeningSignalType;
  value: number | null;
};

@Injectable()
export class ListeningTopicAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): ListeningAnalysisDatabase {
    return this.prisma as unknown as ListeningAnalysisDatabase;
  }

  async analyzeScoped(
    topicId: string,
    input: AnalyzeListeningTopicDto,
    context: IListeningScope,
  ): Promise<ListeningAnalysisResult> {
    const window = parseAnalysisWindow(input);
    const topic = await this.findTopicScoped(topicId, context);
    const sourceIds = topic.sources
      .map(({ sourceId }) => sourceId)
      .sort((left, right) => left.localeCompare(right));
    const sourceIdSet = new Set(sourceIds);
    const rawEvidence = await this.db.listeningEvidence.findMany({
      include: { topicSource: { select: { sourceId: true } } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      where: {
        OR: [
          {
            occurredAt: {
              gte: window.previousStart,
              lt: window.previousEnd,
            },
          },
          {
            occurredAt: {
              gte: window.currentStart,
              lt: window.currentEnd,
            },
          },
        ],
        brandId: context.brandId,
        isDeleted: false,
        organizationId: context.organizationId,
        topicId,
        topicSource: { isDeleted: false },
      },
    });
    const scopedEvidence = rawEvidence.filter(
      (item) =>
        item.organizationId === context.organizationId &&
        item.brandId === context.brandId &&
        item.topicId === topicId &&
        !item.isDeleted &&
        sourceIdSet.has(item.topicSource.sourceId) &&
        isInsideEitherWindow(item.occurredAt, window),
    );
    const freshEvidence = scopedEvidence.filter(
      ({ freshnessExpiresAt }) => freshnessExpiresAt >= window.currentEnd,
    );
    const clusters = clusterEvidence(freshEvidence, topic.keywords);
    const analysisKey = buildAnalysisKey(topicId, window);
    const calculation = calculateSignals(
      scopedEvidence,
      freshEvidence,
      sourceIds,
      window,
    );

    const persisted = await this.persistAnalysis(
      topicId,
      context,
      window,
      analysisKey,
      clusters,
      calculation.signals,
    );

    if (calculation.reason) {
      return {
        ...persisted,
        analysisKey,
        methodologyVersion: LISTENING_ANALYSIS_METHODOLOGY_VERSION,
        reason: calculation.reason,
        status: 'insufficient_evidence',
      };
    }

    return {
      ...persisted,
      analysisKey,
      methodologyVersion: LISTENING_ANALYSIS_METHODOLOGY_VERSION,
      status: 'sufficient',
    };
  }

  async listThemesScoped(
    topicId: string,
    context: IListeningScope,
    query: ListeningAnalysisQueryDto,
  ) {
    await this.findTopicScoped(topicId, context);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const where = scopedWhere(context.organizationId, {
      brandId: context.brandId,
      isDeleted: query.isDeleted ?? false,
      topicId,
    });
    const [records, total] = await Promise.all([
      this.db.listeningTheme.findMany({
        include: {
          evidence: {
            orderBy: { evidenceId: 'asc' },
            select: { evidenceId: true },
          },
        },
        orderBy: [{ currentWindowEnd: 'desc' }, { clusterKey: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.db.listeningTheme.count({ where }),
    ]);
    const docs = records.map((record) =>
      toThemeDocumentWithEvidence(record as Record<string, unknown>),
    );

    return {
      docs,
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async listSignalsScoped(
    topicId: string,
    context: IListeningScope,
    query: ListeningAnalysisQueryDto,
  ) {
    await this.findTopicScoped(topicId, context);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const where = scopedWhere(context.organizationId, {
      brandId: context.brandId,
      isDeleted: query.isDeleted ?? false,
      topicId,
    });
    const [docs, total] = await Promise.all([
      this.db.listeningSignal.findMany({
        orderBy: [{ currentWindowEnd: 'desc' }, { signalType: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.db.listeningSignal.count({ where }),
    ]);
    return {
      docs: docs as ListeningSignalDocument[],
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async reviewThemeScoped(
    topicId: string,
    themeId: string,
    input: ReviewListeningThemeDto,
    context: IListeningScope,
    reviewedAt = new Date(),
  ): Promise<ListeningThemeDocument> {
    await this.findTopicScoped(topicId, context);
    if (!context.userId) {
      throw new BadRequestException('Authenticated user context is required');
    }

    const where = scopedWhere(context.organizationId, {
      brandId: context.brandId,
      id: themeId,
      topicId,
    });
    const result = await this.db.listeningTheme.updateMany({
      data: {
        reviewState: input.state,
        reviewedAt,
        reviewedBy: context.userId,
      },
      where,
    });
    const count = (result as { count?: number }).count ?? 0;
    if (count !== 1) {
      throw new NotFoundException({ message: 'Listening theme not found' });
    }

    const record = await this.db.listeningTheme.findFirst({
      include: {
        evidence: {
          orderBy: { evidenceId: 'asc' },
          select: { evidenceId: true },
        },
      },
      where,
    });
    if (!record) {
      throw new NotFoundException({ message: 'Listening theme not found' });
    }

    return toThemeDocumentWithEvidence(record);
  }

  private async findTopicScoped(
    topicId: string,
    context: IListeningScope,
  ): Promise<AnalysisTopic> {
    const topic = await this.db.listeningTopic.findFirst({
      include: {
        sources: {
          select: { sourceId: true },
          where: { isDeleted: false },
        },
      },
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: topicId,
      }),
    });

    if (!topic) {
      throw new NotFoundException({ message: 'Listening topic not found' });
    }

    return topic;
  }

  private async persistAnalysis(
    topicId: string,
    context: IListeningScope,
    window: AnalysisWindow,
    analysisKey: string,
    clusters: EvidenceCluster[],
    calculations: SignalCalculation[],
  ): Promise<{
    signals: ListeningSignalDocument[];
    themes: ListeningThemeDocument[];
  }> {
    return this.db.$transaction(async (transaction) => {
      await transaction.listeningTheme.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(context.organizationId, {
          analysisKey,
          brandId: context.brandId,
          topicId,
        }),
      });
      await transaction.listeningSignal.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(context.organizationId, {
          analysisKey,
          brandId: context.brandId,
          topicId,
        }),
      });

      const themes: ListeningThemeDocument[] = [];
      for (const cluster of clusters) {
        const idempotencyKey = stableHash(
          `${analysisKey}:theme:${cluster.clusterKey}`,
        );
        const themeData = {
          analysisKey,
          brandId: context.brandId,
          clusterKey: cluster.clusterKey,
          currentWindowEnd: window.currentEnd,
          currentWindowStart: window.currentStart,
          idempotencyKey,
          isDeleted: false,
          label: cluster.label,
          methodologyVersion: LISTENING_ANALYSIS_METHODOLOGY_VERSION,
          organizationId: context.organizationId,
          previousWindowEnd: window.previousEnd,
          previousWindowStart: window.previousStart,
          topicId,
        };
        // tenant-scope-ignore: organizationId is pinned by the compound key; isDeleted is omitted so rerunning the analysis reactivates its tombstoned theme
        const record = await transaction.listeningTheme.upsert({
          create: themeData,
          update: {
            clusterKey: cluster.clusterKey,
            currentWindowEnd: window.currentEnd,
            currentWindowStart: window.currentStart,
            isDeleted: false,
            label: cluster.label,
            methodologyVersion: LISTENING_ANALYSIS_METHODOLOGY_VERSION,
            previousWindowEnd: window.previousEnd,
            previousWindowStart: window.previousStart,
          },
          where: {
            organizationId_brandId_topicId_idempotencyKey: {
              brandId: context.brandId,
              idempotencyKey,
              organizationId: context.organizationId,
              topicId,
            },
          },
        });
        const themeId = String(record.id);
        const evidenceIds = cluster.evidence.map(({ id }) => id).sort();
        await transaction.listeningThemeEvidence.deleteMany({
          where: {
            brandId: context.brandId,
            organizationId: context.organizationId,
            themeId,
            topicId,
          },
        });
        if (evidenceIds.length > 0) {
          await transaction.listeningThemeEvidence.createMany({
            data: evidenceIds.map((evidenceId) => ({
              brandId: context.brandId,
              evidenceId,
              organizationId: context.organizationId,
              themeId,
              topicId,
            })),
            skipDuplicates: true,
          });
        }
        themes.push(toThemeDocument(record, themeData, evidenceIds));
      }

      const signals: ListeningSignalDocument[] = [];
      for (const calculation of calculations) {
        const idempotencyKey = stableHash(
          `${analysisKey}:signal:${calculation.signalType}`,
        );
        const signalData = {
          analysisKey,
          brandId: context.brandId,
          confidence: calculation.confidence,
          currentWindowEnd: window.currentEnd,
          currentWindowStart: window.currentStart,
          evidenceIds: calculation.evidenceIds,
          excludedSourceIds: calculation.excludedSourceIds,
          idempotencyKey,
          includedSourceIds: calculation.includedSourceIds,
          insufficiencyReason: calculation.insufficiencyReason,
          isDeleted: false,
          methodologyVersion: LISTENING_ANALYSIS_METHODOLOGY_VERSION,
          organizationId: context.organizationId,
          previousWindowEnd: window.previousEnd,
          previousWindowStart: window.previousStart,
          signalType: calculation.signalType,
          status: calculation.insufficiencyReason
            ? ('insufficient_evidence' as const)
            : ('sufficient' as const),
          themeId: null,
          topicId,
          value: calculation.value,
        };
        // tenant-scope-ignore: organizationId is pinned by the compound key; isDeleted is omitted so rerunning the analysis reactivates its tombstoned signal
        const record = await transaction.listeningSignal.upsert({
          create: signalData,
          update: {
            confidence: calculation.confidence,
            evidenceIds: calculation.evidenceIds,
            excludedSourceIds: calculation.excludedSourceIds,
            includedSourceIds: calculation.includedSourceIds,
            insufficiencyReason: calculation.insufficiencyReason,
            isDeleted: false,
            methodologyVersion: LISTENING_ANALYSIS_METHODOLOGY_VERSION,
            status: signalData.status,
            value: calculation.value,
          },
          where: {
            organizationId_brandId_topicId_idempotencyKey: {
              brandId: context.brandId,
              idempotencyKey,
              organizationId: context.organizationId,
              topicId,
            },
          },
        });
        signals.push(toSignalDocument(record, signalData));
      }

      return { signals, themes };
    });
  }
}

function parseAnalysisWindow(input: AnalyzeListeningTopicDto): AnalysisWindow {
  const window = {
    currentEnd: new Date(input.currentWindowEnd),
    currentStart: new Date(input.currentWindowStart),
    minimumEvidence: input.minimumEvidencePerWindow ?? 2,
    previousEnd: new Date(input.previousWindowEnd),
    previousStart: new Date(input.previousWindowStart),
  };
  const dates = [
    window.previousStart,
    window.previousEnd,
    window.currentStart,
    window.currentEnd,
  ];
  if (dates.some((date) => Number.isNaN(date.getTime()))) {
    throw new BadRequestException('Listening analysis windows must be valid');
  }
  if (
    window.previousStart >= window.previousEnd ||
    window.previousEnd > window.currentStart ||
    window.currentStart >= window.currentEnd
  ) {
    throw new BadRequestException(
      'Listening analysis windows must be ordered and non-overlapping',
    );
  }
  const previousDuration =
    window.previousEnd.getTime() - window.previousStart.getTime();
  const currentDuration =
    window.currentEnd.getTime() - window.currentStart.getTime();
  if (
    previousDuration > MAX_WINDOW_MILLISECONDS ||
    currentDuration > MAX_WINDOW_MILLISECONDS
  ) {
    throw new BadRequestException(
      'Listening analysis windows cannot exceed 31 days',
    );
  }
  if (previousDuration !== currentDuration) {
    throw new BadRequestException(
      'Listening analysis comparison windows must have equal duration',
    );
  }
  if (
    !Number.isInteger(window.minimumEvidence) ||
    window.minimumEvidence < 1 ||
    window.minimumEvidence > 100
  ) {
    throw new BadRequestException(
      'minimumEvidencePerWindow must be between 1 and 100',
    );
  }
  return window;
}

function isInsideEitherWindow(
  occurredAt: Date,
  window: AnalysisWindow,
): boolean {
  return (
    (occurredAt >= window.previousStart && occurredAt < window.previousEnd) ||
    (occurredAt >= window.currentStart && occurredAt < window.currentEnd)
  );
}

function clusterEvidence(
  evidence: AnalysisEvidence[],
  keywords: string[],
): EvidenceCluster[] {
  const normalizedKeywords = [...new Set(keywords.map(normalizeText))]
    .filter(Boolean)
    .sort(
      (left, right) => right.length - left.length || left.localeCompare(right),
    );
  const clusters = new Map<string, AnalysisEvidence[]>();

  for (const item of evidence) {
    const text = normalizeText(item.contentExcerpt ?? '');
    const clusterKey =
      normalizedKeywords.find((keyword) => text.includes(keyword)) ??
      'unclassified';
    const members = clusters.get(clusterKey) ?? [];
    members.push(item);
    clusters.set(clusterKey, members);
  }

  return [...clusters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([clusterKey, members]) => ({
      clusterKey,
      evidence: members.sort(
        (left, right) =>
          left.occurredAt.getTime() - right.occurredAt.getTime() ||
          left.id.localeCompare(right.id),
      ),
      label: clusterKey === 'unclassified' ? 'Other evidence' : clusterKey,
    }));
}

function calculateSignals(
  scopedEvidence: AnalysisEvidence[],
  freshEvidence: AnalysisEvidence[],
  sourceIds: string[],
  window: AnalysisWindow,
): {
  reason: ListeningInsufficiencyReason | null;
  signals: SignalCalculation[];
} {
  const currentSources = sourceIdsWithEvidence(
    freshEvidence,
    window.currentStart,
    window.currentEnd,
  );
  const previousSources = sourceIdsWithEvidence(
    freshEvidence,
    window.previousStart,
    window.previousEnd,
  );
  const includedSourceIds = sourceIds.filter(
    (sourceId) => currentSources.has(sourceId) && previousSources.has(sourceId),
  );
  const includedSourceIdSet = new Set(includedSourceIds);
  const excludedSourceIds = sourceIds.filter(
    (sourceId) => !includedSourceIdSet.has(sourceId),
  );
  const attributableEvidence = freshEvidence.filter((item) =>
    includedSourceIdSet.has(item.topicSource.sourceId),
  );
  const currentEvidence = evidenceInsideWindow(
    attributableEvidence,
    window.currentStart,
    window.currentEnd,
  );
  const previousEvidence = evidenceInsideWindow(
    attributableEvidence,
    window.previousStart,
    window.previousEnd,
  );
  const reason = insufficiencyReason(
    scopedEvidence,
    freshEvidence,
    includedSourceIds,
    currentEvidence,
    previousEvidence,
    window.minimumEvidence,
  );
  const evidenceIds = (
    attributableEvidence.length ? attributableEvidence : freshEvidence
  )
    .map(({ id }) => id)
    .sort();
  const confidence = reason
    ? 0
    : bounded(
        (includedSourceIds.length / Math.max(1, sourceIds.length)) *
          Math.min(
            1,
            Math.min(currentEvidence.length, previousEvidence.length) /
              (window.minimumEvidence * 2),
          ),
        0,
        1,
      );
  const currentSentiment = sentimentValues(currentEvidence);
  const sentimentReason =
    reason ??
    (currentSentiment.length < window.minimumEvidence
      ? 'underpowered_evidence'
      : null);
  const currentCount = currentEvidence.length;
  const previousCount = previousEvidence.length;

  return {
    reason,
    signals: SIGNAL_TYPES.map((signalType) => {
      const signalReason =
        signalType === 'sentiment_direction' ? sentimentReason : reason;
      return {
        confidence: signalReason ? 0 : confidence,
        evidenceIds,
        excludedSourceIds,
        includedSourceIds,
        insufficiencyReason: signalReason,
        signalType,
        value: signalReason
          ? null
          : calculateSignalValue(
              signalType,
              currentCount,
              previousCount,
              currentSentiment,
            ),
      };
    }),
  };
}

function sourceIdsWithEvidence(
  evidence: AnalysisEvidence[],
  start: Date,
  end: Date,
): Set<string> {
  return new Set(
    evidenceInsideWindow(evidence, start, end).map(
      ({ topicSource }) => topicSource.sourceId,
    ),
  );
}

function evidenceInsideWindow(
  evidence: AnalysisEvidence[],
  start: Date,
  end: Date,
): AnalysisEvidence[] {
  return evidence.filter(
    ({ occurredAt }) => occurredAt >= start && occurredAt < end,
  );
}

function insufficiencyReason(
  scopedEvidence: AnalysisEvidence[],
  freshEvidence: AnalysisEvidence[],
  includedSourceIds: string[],
  currentEvidence: AnalysisEvidence[],
  previousEvidence: AnalysisEvidence[],
  minimumEvidence: number,
): ListeningInsufficiencyReason | null {
  if (scopedEvidence.length === 0) {
    return 'missing_evidence';
  }
  if (freshEvidence.length === 0) {
    return 'stale_evidence';
  }
  if (includedSourceIds.length === 0) {
    return 'source_coverage_gap';
  }
  if (
    currentEvidence.length < minimumEvidence ||
    previousEvidence.length < minimumEvidence
  ) {
    return 'underpowered_evidence';
  }
  return null;
}

function calculateSignalValue(
  signalType: ListeningSignalType,
  currentCount: number,
  previousCount: number,
  currentSentiment: number[],
): number {
  switch (signalType) {
    case 'volume':
      return currentCount;
    case 'change':
      return bounded((currentCount - previousCount) / previousCount, -1, 1);
    case 'comparative':
      return bounded(
        (currentCount - previousCount) / (currentCount + previousCount),
        -1,
        1,
      );
    case 'sentiment_direction':
      return bounded(average(currentSentiment), -1, 1);
  }
}

function sentimentValues(evidence: AnalysisEvidence[]): number[] {
  return evidence.flatMap(({ metrics }) => {
    const value = metrics.sentiment ?? metrics.sentimentScore;
    return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
  });
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function buildAnalysisKey(topicId: string, window: AnalysisWindow): string {
  return stableHash(
    JSON.stringify({
      currentWindowEnd: window.currentEnd.toISOString(),
      currentWindowStart: window.currentStart.toISOString(),
      methodologyVersion: LISTENING_ANALYSIS_METHODOLOGY_VERSION,
      minimumEvidencePerWindow: window.minimumEvidence,
      previousWindowEnd: window.previousEnd.toISOString(),
      previousWindowStart: window.previousStart.toISOString(),
      topicId,
    }),
  );
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toThemeDocument(
  record: Record<string, unknown>,
  data: Record<string, unknown>,
  evidenceIds: string[],
): ListeningThemeDocument {
  const now = new Date();
  return {
    ...data,
    ...record,
    createdAt: (record.createdAt as Date | undefined) ?? now,
    evidenceIds,
    id: String(record.id),
    updatedAt: (record.updatedAt as Date | undefined) ?? now,
  } as unknown as ListeningThemeDocument;
}

function toThemeDocumentWithEvidence(
  record: Record<string, unknown>,
): ListeningThemeDocument {
  const typed = record as Record<string, unknown> & {
    evidence?: Array<{ evidenceId: string }>;
  };
  const { evidence, ...theme } = typed;
  return {
    ...theme,
    evidenceIds: (evidence ?? []).map(({ evidenceId }) => evidenceId).sort(),
  } as unknown as ListeningThemeDocument;
}

function toSignalDocument(
  record: Record<string, unknown>,
  data: Record<string, unknown>,
): ListeningSignalDocument {
  const now = new Date();
  return {
    ...data,
    ...record,
    createdAt: (record.createdAt as Date | undefined) ?? now,
    id: String(record.id),
    updatedAt: (record.updatedAt as Date | undefined) ?? now,
  } as unknown as ListeningSignalDocument;
}
