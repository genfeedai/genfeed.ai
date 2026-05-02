import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface AnalyticsFeedbackOutput {
  topTopics: string[];
  topHooks: string[];
  worstTopics: string[];
  bestPlatform: string | null;
  avgEngagementRate: number;
  weekOverWeekDirection: 'up' | 'down' | 'stable';
  weekOverWeekChange: number;
  bestPostingTimes: Array<{
    dayOfWeek: number;
    hour: number;
    avgEngagement: number;
  }>;
}

export type AnalyticsFeedbackResolver = (params: {
  organizationId: string;
  brandId: string;
  topN?: number;
  worstN?: number;
}) => Promise<AnalyticsFeedbackOutput>;

export class AnalyticsFeedbackExecutor extends BaseExecutor {
  readonly nodeType = 'analyticsFeedback';
  private resolver: AnalyticsFeedbackResolver | null = null;

  setResolver(resolver: AnalyticsFeedbackResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const topN = node.config.topN;
    if (
      topN !== undefined &&
      (typeof topN !== 'number' || topN < 1 || topN > 50)
    ) {
      errors.push('topN must be between 1 and 50');
    }

    const worstN = node.config.worstN;
    if (
      worstN !== undefined &&
      (typeof worstN !== 'number' || worstN < 1 || worstN > 50)
    ) {
      errors.push('worstN must be between 1 and 50');
    }

    return { errors, valid: errors.length === 0 };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, context } = input;

    if (!this.resolver) {
      throw new Error('Analytics feedback resolver not configured');
    }

    const topN = this.getOptionalConfig<number>(node.config, 'topN', 5);
    const worstN = this.getOptionalConfig<number>(node.config, 'worstN', 5);

    const brandId =
      this.getOptionalConfig<string | null>(node.config, 'brandId', null) ??
      ((context as unknown as Record<string, unknown>).brandId as
        | string
        | undefined);

    if (!brandId) {
      return {
        data: {
          avgEngagementRate: 0,
          bestPlatform: null,
          bestPostingTimes: [],
          topHooks: [],
          topTopics: [],
          weekOverWeekChange: 0,
          weekOverWeekDirection: 'stable' as const,
          worstTopics: [],
        } satisfies AnalyticsFeedbackOutput,
        metadata: { reason: 'no_brand_id', skipped: true },
      };
    }

    const feedback = await this.resolver({
      brandId,
      organizationId: context.organizationId,
      topN,
      worstN,
    });

    return {
      data: feedback,
      metadata: { resolvedAt: new Date().toISOString() },
    };
  }
}

export function createAnalyticsFeedbackExecutor(
  resolver?: AnalyticsFeedbackResolver,
): AnalyticsFeedbackExecutor {
  const executor = new AnalyticsFeedbackExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
