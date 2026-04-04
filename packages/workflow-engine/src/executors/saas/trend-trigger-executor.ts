import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type TrendPlatform = 'tiktok' | 'instagram' | 'youtube' | 'twitter';
export type TrendType = 'video' | 'sound' | 'hashtag';
export type CheckFrequency = '15min' | '30min' | '1hr' | '6hr' | '24hr';

export interface TrendTriggerOutput {
  trendId: string;
  topic: string;
  platform: TrendPlatform;
  viralScore: number;
  hashtags: string[];
  videoUrl: string | null;
  soundId: string | null;
}

export type TrendChecker = (params: {
  organizationId: string;
  platform: TrendPlatform;
  trendType: TrendType;
  minViralScore: number;
  keywords: string[];
  excludeKeywords: string[];
  lastTrendId: string | null;
}) => Promise<TrendTriggerOutput | null>;

/**
 * Trend Trigger Executor
 *
 * Starts a workflow when a new trend matches the configured criteria.
 * Polls trends at configurable intervals and deduplicates to avoid re-triggering.
 *
 * Node Type: trendTrigger
 * Definition: @genfeedai/workflow-saas/nodes/trend-trigger.ts
 */
export class TrendTriggerExecutor extends BaseExecutor {
  readonly nodeType = 'trendTrigger';
  private checker: TrendChecker | null = null;

  setChecker(checker: TrendChecker): void {
    this.checker = checker;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: TrendPlatform[] = [
      'tiktok',
      'instagram',
      'youtube',
      'twitter',
    ];
    if (!platform || !validPlatforms.includes(platform as TrendPlatform)) {
      errors.push(
        `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
      );
    }

    const trendType = node.config.trendType;
    const validTypes: TrendType[] = ['video', 'sound', 'hashtag'];
    if (!trendType || !validTypes.includes(trendType as TrendType)) {
      errors.push(
        `Invalid trend type. Must be one of: ${validTypes.join(', ')}`,
      );
    }

    const minViralScore = node.config.minViralScore;
    if (
      minViralScore !== undefined &&
      (typeof minViralScore !== 'number' ||
        minViralScore < 0 ||
        minViralScore > 100)
    ) {
      errors.push('Min viral score must be between 0 and 100');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, context } = input;

    if (!this.checker) {
      throw new Error('Trend checker not configured');
    }

    const platform = this.getRequiredConfig<TrendPlatform>(
      node.config,
      'platform',
    );
    const trendType = this.getRequiredConfig<TrendType>(
      node.config,
      'trendType',
    );
    const minViralScore = this.getOptionalConfig<number>(
      node.config,
      'minViralScore',
      70,
    );
    const keywords = this.getOptionalConfig<string[]>(
      node.config,
      'keywords',
      [],
    );
    const excludeKeywords = this.getOptionalConfig<string[]>(
      node.config,
      'excludeKeywords',
      [],
    );
    const lastTrendId = this.getOptionalConfig<string | null>(
      node.config,
      'lastTrendId',
      null,
    );

    const trend = await this.checker({
      excludeKeywords,
      keywords,
      lastTrendId,
      minViralScore,
      organizationId: context.organizationId,
      platform,
      trendType,
    });

    if (!trend) {
      return {
        data: null,
        metadata: {
          noNewTrend: true,
        },
      };
    }

    return {
      data: {
        hashtags: trend.hashtags,
        platform: trend.platform,
        soundId: trend.soundId,
        topic: trend.topic,
        trendId: trend.trendId,
        videoUrl: trend.videoUrl,
        viralScore: trend.viralScore,
      },
      metadata: {
        checkedAt: new Date().toISOString(),
        trendId: trend.trendId,
      },
    };
  }
}

export function createTrendTriggerExecutor(
  checker?: TrendChecker,
): TrendTriggerExecutor {
  const executor = new TrendTriggerExecutor();
  if (checker) {
    executor.setChecker(checker);
  }
  return executor;
}
