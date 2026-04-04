import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export type EngagementTriggerPlatform = 'twitter' | 'instagram' | 'threads';

export type EngagementMetricType = 'likes' | 'comments' | 'shares' | 'views';

export interface EngagementTriggerOutput {
  /** The post/tweet ID that hit the threshold */
  postId: string;
  /** URL of the post */
  postUrl: string;
  /** The metric type that triggered */
  metricType: EngagementMetricType;
  /** Current value of the metric */
  currentValue: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Platform */
  platform: EngagementTriggerPlatform;
  /** Timestamp of the trigger event */
  triggeredAt: string;
}

export type EngagementChecker = (params: {
  organizationId: string;
  platform: EngagementTriggerPlatform;
  postIds: string[];
  metricType: EngagementMetricType;
  threshold: number;
  lastCheckedPostId: string | null;
}) => Promise<EngagementTriggerOutput | null>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Engagement Trigger Executor
 *
 * Starts a workflow when engagement metrics (likes, comments, shares, views)
 * on monitored posts hit a configured threshold.
 *
 * Node Type: engagementTrigger
 */
export class EngagementTriggerExecutor extends BaseExecutor {
  readonly nodeType = 'engagementTrigger';
  private checker: EngagementChecker | null = null;

  setChecker(checker: EngagementChecker): void {
    this.checker = checker;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: EngagementTriggerPlatform[] = [
      'twitter',
      'instagram',
      'threads',
    ];
    if (
      !platform ||
      !validPlatforms.includes(platform as EngagementTriggerPlatform)
    ) {
      errors.push(
        `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
      );
    }

    const metricType = node.config.metricType;
    const validMetrics: EngagementMetricType[] = [
      'likes',
      'comments',
      'shares',
      'views',
    ];
    if (
      !metricType ||
      !validMetrics.includes(metricType as EngagementMetricType)
    ) {
      errors.push(
        `Invalid metric type. Must be one of: ${validMetrics.join(', ')}`,
      );
    }

    const threshold = node.config.threshold;
    if (
      threshold === undefined ||
      typeof threshold !== 'number' ||
      threshold <= 0
    ) {
      errors.push('Threshold must be a positive number');
    }

    return { errors, valid: errors.length === 0 };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, context } = input;

    if (!this.checker) {
      throw new Error('Engagement checker not configured');
    }

    const platform = this.getRequiredConfig<EngagementTriggerPlatform>(
      node.config,
      'platform',
    );
    const postIds = this.getOptionalConfig<string[]>(
      node.config,
      'postIds',
      [],
    );
    const metricType = this.getRequiredConfig<EngagementMetricType>(
      node.config,
      'metricType',
    );
    const threshold = this.getRequiredConfig<number>(node.config, 'threshold');
    const lastCheckedPostId = this.getOptionalConfig<string | null>(
      node.config,
      'lastCheckedPostId',
      null,
    );

    const result = await this.checker({
      lastCheckedPostId,
      metricType,
      organizationId: context.organizationId,
      platform,
      postIds,
      threshold,
    });

    if (!result) {
      return {
        data: null,
        metadata: { matched: false, metricType, platform },
      };
    }

    return {
      data: result,
      metadata: {
        currentValue: result.currentValue,
        matched: true,
        metricType: result.metricType,
        platform,
        postId: result.postId,
        threshold: result.threshold,
      },
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }
}

export function createEngagementTriggerExecutor(): EngagementTriggerExecutor {
  return new EngagementTriggerExecutor();
}
