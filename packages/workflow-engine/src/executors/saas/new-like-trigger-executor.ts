import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export type LikeTriggerPlatform = 'twitter' | 'instagram';

export interface NewLikeTriggerOutput {
  /** The post/tweet ID that was liked */
  postId: string;
  /** URL of the liked post */
  postUrl: string;
  /** User ID of the person who liked */
  likerId: string;
  /** Username of the person who liked */
  likerUsername: string;
  /** Platform */
  platform: LikeTriggerPlatform;
  /** Timestamp of the like event */
  likedAt: string;
}

export type NewLikeChecker = (params: {
  organizationId: string;
  platform: LikeTriggerPlatform;
  postIds?: string[];
  minLikerFollowerCount?: number;
  lastLikeId: string | null;
}) => Promise<NewLikeTriggerOutput | null>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * New Like Trigger Executor
 *
 * Starts a workflow when a new like is detected on monitored posts.
 *
 * Node Type: newLikeTrigger
 */
export class NewLikeTriggerExecutor extends BaseExecutor {
  readonly nodeType = 'newLikeTrigger';
  private checker: NewLikeChecker | null = null;

  setChecker(checker: NewLikeChecker): void {
    this.checker = checker;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: LikeTriggerPlatform[] = ['twitter', 'instagram'];
    if (
      !platform ||
      !validPlatforms.includes(platform as LikeTriggerPlatform)
    ) {
      errors.push(
        `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
      );
    }

    return { errors, valid: errors.length === 0 };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, context } = input;

    if (!this.checker) {
      throw new Error('New like checker not configured');
    }

    const platform = this.getRequiredConfig<LikeTriggerPlatform>(
      node.config,
      'platform',
    );
    const postIds = this.getOptionalConfig<string[]>(
      node.config,
      'postIds',
      [],
    );
    const minLikerFollowerCount = this.getOptionalConfig<number | undefined>(
      node.config,
      'minLikerFollowerCount',
      undefined,
    );
    const lastLikeId = this.getOptionalConfig<string | null>(
      node.config,
      'lastLikeId',
      null,
    );

    const result = await this.checker({
      lastLikeId,
      minLikerFollowerCount,
      organizationId: context.organizationId,
      platform,
      postIds,
    });

    if (!result) {
      return {
        data: null,
        metadata: { matched: false, platform },
      };
    }

    return {
      data: result,
      metadata: {
        likerId: result.likerId,
        matched: true,
        platform,
        postId: result.postId,
      },
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }
}

export function createNewLikeTriggerExecutor(): NewLikeTriggerExecutor {
  return new NewLikeTriggerExecutor();
}
