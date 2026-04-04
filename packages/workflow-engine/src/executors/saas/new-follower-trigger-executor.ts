import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export type FollowerTriggerPlatform = 'twitter' | 'instagram';

export interface NewFollowerTriggerOutput {
  /** The new follower's user ID */
  followerId: string;
  /** The new follower's username */
  followerUsername: string;
  /** The new follower's display name */
  followerDisplayName?: string;
  /** Follower count of the new follower */
  followerFollowerCount?: number;
  /** Platform */
  platform: FollowerTriggerPlatform;
  /** Timestamp of the follow event */
  followedAt: string;
}

export type NewFollowerChecker = (params: {
  organizationId: string;
  platform: FollowerTriggerPlatform;
  minFollowerCount?: number;
  lastFollowerId: string | null;
}) => Promise<NewFollowerTriggerOutput | null>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * New Follower Trigger Executor
 *
 * Starts a workflow when a new follower matching criteria is detected.
 * Polls followers at configurable intervals and deduplicates.
 *
 * Node Type: newFollowerTrigger
 */
export class NewFollowerTriggerExecutor extends BaseExecutor {
  readonly nodeType = 'newFollowerTrigger';
  private checker: NewFollowerChecker | null = null;

  setChecker(checker: NewFollowerChecker): void {
    this.checker = checker;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: FollowerTriggerPlatform[] = ['twitter', 'instagram'];
    if (
      !platform ||
      !validPlatforms.includes(platform as FollowerTriggerPlatform)
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
      throw new Error('New follower checker not configured');
    }

    const platform = this.getRequiredConfig<FollowerTriggerPlatform>(
      node.config,
      'platform',
    );
    const minFollowerCount = this.getOptionalConfig<number | undefined>(
      node.config,
      'minFollowerCount',
      undefined,
    );
    const lastFollowerId = this.getOptionalConfig<string | null>(
      node.config,
      'lastFollowerId',
      null,
    );

    const result = await this.checker({
      lastFollowerId,
      minFollowerCount,
      organizationId: context.organizationId,
      platform,
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
        followerId: result.followerId,
        matched: true,
        platform,
      },
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }
}

export function createNewFollowerTriggerExecutor(): NewFollowerTriggerExecutor {
  return new NewFollowerTriggerExecutor();
}
