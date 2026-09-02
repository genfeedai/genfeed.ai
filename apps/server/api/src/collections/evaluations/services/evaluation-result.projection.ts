import { Status } from '@genfeedai/enums';
import type {
  IEvaluationComparisonResult,
  IEvaluationComparisonScoreBreakdown,
  IEvaluationReview,
  IEvaluationReviewerComment,
  IEvaluationTrend,
} from '@genfeedai/interfaces';

export interface EvaluationAiResult {
  analysis: unknown;
  flags: unknown;
  overallScore: number;
  scores: unknown;
}

export interface EvaluationData {
  actualPerformance?: unknown;
  analysis?: unknown;
  brandId?: string;
  evaluationType?: string;
  flags?: unknown;
  overallScore?: number;
  review?: IEvaluationReview;
  reviewerComments?: IEvaluationReviewerComment[];
  scores?: unknown;
  status?: string;
  userId?: string;
}

export interface EvaluationProjectionRow {
  contentId?: string | null;
  contentType?: string | null;
  data?: unknown;
  id: string;
  updatedAt: Date;
}

export interface EvaluationTrendFilters {
  evaluationType?: string;
  maxScore?: string;
  minScore?: string;
}

export interface EvaluationTrendRow {
  data: unknown;
  updatedAt: Date;
}

interface PostBrandContext {
  guidelines?: unknown;
  name?: string;
}

export interface PostEvaluationContent {
  brand?: PostBrandContext;
  description?: string;
  id?: string;
  label?: string;
  platform?: string;
}

export interface PostThreadChild {
  description?: string;
  order?: number;
}

export interface PreviousEvaluationRow {
  data?: unknown;
  updatedAt: Date;
}

export interface PublicationMetrics {
  engagement?: number;
  engagementRate?: number;
  views?: number;
}

interface ReviewProjectionInput {
  comment?: string;
  decision?: IEvaluationReview['decision'];
  existingData: EvaluationData;
  reviewedAt: string;
  reviewerId: string;
  reviewerScore?: number;
  tags?: string[];
}

interface TrendGroup {
  brandScores: number[];
  count: number;
  engagementScores: number[];
  scores: number[];
  technicalScores: number[];
}

/**
 * Pure owner for deterministic evaluation context, scoring, and response
 * projection. Persistence, provider execution, credits, and notifications stay
 * in the runtime services.
 */
export class EvaluationResultProjection {
  buildActualPerformanceData(
    data: EvaluationData,
    metrics: PublicationMetrics,
    predictedEngagement: number,
    syncedAt: string,
  ): Record<string, unknown> {
    const actualEngagement = metrics.engagement || 0;

    return this.buildStoredEvaluationData({
      ...data,
      actualPerformance: {
        accuracyScore: 100 - Math.abs(predictedEngagement - actualEngagement),
        engagement: actualEngagement,
        engagementRate: metrics.engagementRate || 0,
        syncedAt,
        views: metrics.views || 0,
      },
    });
  }

  buildBrandContext(brand?: PostBrandContext):
    | {
        description?: string;
        label: string;
        text?: string;
      }
    | undefined {
    const label = this.readString(brand?.name);
    if (!label) {
      return undefined;
    }

    const guidelines = this.readString(brand?.guidelines);

    return {
      label,
      ...(guidelines
        ? {
            description: guidelines,
            text: guidelines,
          }
        : {}),
    };
  }

  buildComparisonResult(
    evaluationIds: string[],
    evaluations: EvaluationProjectionRow[],
    comparedAt: string,
  ): IEvaluationComparisonResult {
    const rankings = evaluations.map((evaluation) => {
      const data = (evaluation.data as EvaluationData | null) ?? {};
      const analysis = this.readObjectRecord(data.analysis);
      const review = this.readObjectRecord(data.review);
      const scoreBreakdown = this.buildComparisonScoreBreakdown(data);

      return {
        compositeScore: this.calculateCompositeScore(scoreBreakdown),
        contentId: evaluation.contentId ?? null,
        contentType: evaluation.contentType ?? null,
        evaluationId: evaluation.id,
        evaluationType: data.evaluationType,
        reviewedAt: this.readString(review.reviewedAt),
        reviewerComment: this.readString(review.comment),
        scoreBreakdown,
        status: data.status,
        strengths: this.readStringArray(analysis.strengths),
        updatedAt: evaluation.updatedAt,
        weaknesses: this.readStringArray(analysis.weaknesses),
      };
    });

    rankings.sort((left, right) => {
      if (right.compositeScore !== left.compositeScore) {
        return right.compositeScore - left.compositeScore;
      }

      return (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    });

    const ranked = rankings.map((ranking, index) => ({
      ...ranking,
      rank: index + 1,
    }));

    return {
      comparedAt,
      evaluationIds,
      rankings: ranked,
      winnerEvaluationId: ranked[0]?.evaluationId,
    };
  }

  buildEvaluationTrends(
    evaluations: EvaluationTrendRow[],
    filters: EvaluationTrendFilters,
  ): IEvaluationTrend[] {
    const grouped = new Map<string, TrendGroup>();

    for (const evaluation of evaluations) {
      const data = evaluation.data as EvaluationData | null;

      if (
        filters.evaluationType &&
        data?.evaluationType !== filters.evaluationType
      ) {
        continue;
      }
      if (
        filters.minScore &&
        (data?.overallScore ?? 0) < parseFloat(filters.minScore)
      ) {
        continue;
      }
      if (
        filters.maxScore &&
        (data?.overallScore ?? 0) > parseFloat(filters.maxScore)
      ) {
        continue;
      }

      const dateKey = evaluation.updatedAt.toISOString().slice(0, 10);
      const group = grouped.get(dateKey) ?? this.createTrendGroup();
      group.count++;

      if (typeof data?.overallScore === 'number') {
        group.scores.push(data.overallScore);
      }
      const scores = data?.scores as Record<
        string,
        Record<string, number>
      > | null;
      if (scores?.brand?.overall) {
        group.brandScores.push(scores.brand.overall);
      }
      if (scores?.engagement?.overall) {
        group.engagementScores.push(scores.engagement.overall);
      }
      if (scores?.technical?.overall) {
        group.technicalScores.push(scores.technical.overall);
      }
      grouped.set(dateKey, group);
    }

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dateKey, group]) => ({
        avgBrandScore: this.average(group.brandScores),
        avgEngagementScore: this.average(group.engagementScores),
        avgScore: this.average(group.scores),
        avgTechnicalScore: this.average(group.technicalScores),
        count: group.count,
        date: dateKey,
      }));
  }

  buildPostEvaluationContext(
    post: PostEvaluationContent,
    children: PostThreadChild[],
    previousEvaluation: PreviousEvaluationRow | null,
  ): {
    context: {
      brand?: ReturnType<EvaluationResultProjection['buildBrandContext']>;
      isThread: boolean;
      label?: string;
      platform?: string;
      previousEvaluation?: {
        overallScore: number;
        scores: {
          brand?: { overall?: number };
          engagement?: { overall?: number };
          technical?: { overall?: number };
        };
        updatedAt: Date;
      };
      threadLength: number;
    };
    threadContent: string;
  } {
    const isThread = children.length > 0;
    const sortedChildren = [...children].sort(
      (left, right) => (left.order || 0) - (right.order || 0),
    );
    const threadContent = sortedChildren.reduce(
      (content, child) => `${content}\n---\n${child.description || ''}`,
      post.description || '',
    );

    return {
      context: {
        brand: this.buildBrandContext(post.brand),
        isThread,
        label: this.readString(post.label),
        platform: this.readString(post.platform),
        previousEvaluation: this.buildPreviousEvaluation(previousEvaluation),
        threadLength: isThread ? children.length + 1 : 1,
      },
      threadContent,
    };
  }

  buildReviewData(input: ReviewProjectionInput): Record<string, unknown> {
    const existingComments = this.readReviewerComments(
      input.existingData.reviewerComments,
    );
    const review: IEvaluationReview = {
      ...(input.comment ? { comment: input.comment } : {}),
      ...(input.decision ? { decision: input.decision } : {}),
      ...(input.reviewerScore !== undefined
        ? { reviewerScore: input.reviewerScore }
        : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      reviewedAt: input.reviewedAt,
      reviewerId: input.reviewerId,
    };
    const reviewerComments = input.comment
      ? [
          ...existingComments,
          {
            comment: input.comment,
            ...(input.decision ? { decision: input.decision } : {}),
            createdAt: input.reviewedAt,
            reviewerId: input.reviewerId,
          },
        ]
      : existingComments;

    return this.buildStoredEvaluationData({
      ...input.existingData,
      review,
      reviewerComments:
        reviewerComments.length > 0 ? reviewerComments : undefined,
    });
  }

  buildReviewTags(tags?: string[]): string[] | undefined {
    const cleaned = tags
      ?.map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    return cleaned && cleaned.length > 0 ? cleaned : undefined;
  }

  buildStoredEvaluationData(value: EvaluationData): Record<string, unknown> {
    return this.serializeJsonRecord(
      Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== undefined),
      ),
    );
  }

  findIncompleteEvaluationIds(
    evaluations: EvaluationProjectionRow[],
  ): string[] {
    return evaluations
      .filter((evaluation) => {
        const data = (evaluation.data as EvaluationData | null) ?? {};
        return data.status !== Status.COMPLETED;
      })
      .map((evaluation) => evaluation.id);
  }

  normalizeEvaluationIds(evaluationIds: string[]): string[] {
    return Array.from(
      new Set(
        evaluationIds
          .map((evaluationId) => evaluationId.trim())
          .filter((evaluationId) => evaluationId.length > 0),
      ),
    );
  }

  readObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  serializeJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private average(values: number[]): number {
    return values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  private buildComparisonScoreBreakdown(
    data: EvaluationData,
  ): IEvaluationComparisonScoreBreakdown {
    const scores = this.readObjectRecord(data.scores);
    const brandScore = this.readScoreBucket(scores.brand)?.overall;
    const engagementScore = this.readScoreBucket(scores.engagement)?.overall;
    const technicalScore = this.readScoreBucket(scores.technical)?.overall;
    const review = this.readObjectRecord(data.review);

    return {
      brandScore,
      engagementScore,
      modelScore: this.readNumber(data.overallScore),
      reviewerScore: this.readNumber(review.reviewerScore),
      technicalScore,
    };
  }

  private buildPreviousEvaluation(
    previousEvaluation: PreviousEvaluationRow | null,
  ):
    | {
        overallScore: number;
        scores: {
          brand?: { overall?: number };
          engagement?: { overall?: number };
          technical?: { overall?: number };
        };
        updatedAt: Date;
      }
    | undefined {
    const data = previousEvaluation?.data as EvaluationData | null;
    const scores = this.readObjectRecord(data?.scores);

    if (
      !previousEvaluation ||
      data?.status !== Status.COMPLETED ||
      data.overallScore === undefined ||
      Object.keys(scores).length === 0
    ) {
      return undefined;
    }

    return {
      overallScore: data.overallScore,
      scores: {
        brand: this.readScoreBucket(scores.brand),
        engagement: this.readScoreBucket(scores.engagement),
        technical: this.readScoreBucket(scores.technical),
      },
      updatedAt: previousEvaluation.updatedAt,
    };
  }

  private calculateCompositeScore(
    scoreBreakdown: IEvaluationComparisonScoreBreakdown,
  ): number {
    const weightedScores = [
      { value: scoreBreakdown.modelScore, weight: 0.5 },
      { value: scoreBreakdown.reviewerScore, weight: 0.25 },
      { value: scoreBreakdown.brandScore, weight: 0.1 },
      { value: scoreBreakdown.engagementScore, weight: 0.1 },
      { value: scoreBreakdown.technicalScore, weight: 0.05 },
    ].filter(
      (entry): entry is { value: number; weight: number } =>
        entry.value !== undefined,
    );

    if (weightedScores.length === 0) {
      return 0;
    }

    const totalWeight = weightedScores.reduce(
      (sum, entry) => sum + entry.weight,
      0,
    );
    const totalScore = weightedScores.reduce(
      (sum, entry) => sum + entry.value * entry.weight,
      0,
    );

    return this.normalizeScore(totalScore / totalWeight);
  }

  private createTrendGroup(): TrendGroup {
    return {
      brandScores: [],
      count: 0,
      engagementScores: [],
      scores: [],
      technicalScores: [],
    };
  }

  private normalizeScore(value: number): number {
    return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private readReviewerComments(value: unknown): IEvaluationReviewerComment[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      const record = this.readObjectRecord(entry);
      const reviewerId = this.readString(record.reviewerId);
      const comment = this.readString(record.comment);
      const createdAt = this.readString(record.createdAt);

      if (!reviewerId || !comment || !createdAt) {
        return [];
      }

      const decision = this.readString(record.decision);

      return [
        {
          comment,
          createdAt,
          ...(decision
            ? { decision: decision as IEvaluationReview['decision'] }
            : {}),
          reviewerId,
        },
      ];
    });
  }

  private readScoreBucket(value: unknown):
    | {
        overall?: number;
      }
    | undefined {
    const record = this.readObjectRecord(value);
    const overall = this.readNumber(record.overall);

    return overall !== undefined ? { overall } : undefined;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }
}
