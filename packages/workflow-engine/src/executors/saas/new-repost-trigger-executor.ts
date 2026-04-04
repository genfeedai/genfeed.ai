import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export type RepostTriggerPlatform = 'twitter' | 'instagram';

export interface NewRepostTriggerOutput {
  /** The original post/tweet ID that was reposted */
  postId: string;
  /** URL of the original post */
  postUrl: string;
  /** User ID of the person who reposted */
  reposterId: string;
  /** Username of the person who reposted */
  reposterUsername: string;
  /** Platform */
  platform: RepostTriggerPlatform;
  /** Timestamp of the repost event */
  repostedAt: string;
}

export type NewRepostChecker = (params: {
  organizationId: string;
  platform: RepostTriggerPlatform;
  postIds?: string[];
  minReposterFollowerCount?: number;
  lastRepostId: string | null;
}) => Promise<NewRepostTriggerOutput | null>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * New Repost Trigger Executor
 *
 * Starts a workflow when a new repost/retweet is detected on monitored posts.
 *
 * Node Type: newRepostTrigger
 */
export class NewRepostTriggerExecutor extends BaseExecutor {
  readonly nodeType = 'newRepostTrigger';
  private checker: NewRepostChecker | null = null;

  setChecker(checker: NewRepostChecker): void {
    this.checker = checker;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: RepostTriggerPlatform[] = ['twitter', 'instagram'];
    if (
      !platform ||
      !validPlatforms.includes(platform as RepostTriggerPlatform)
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
      throw new Error('New repost checker not configured');
    }

    const platform = this.getRequiredConfig<RepostTriggerPlatform>(
      node.config,
      'platform',
    );
    const postIds = this.getOptionalConfig<string[]>(
      node.config,
      'postIds',
      [],
    );
    const minReposterFollowerCount = this.getOptionalConfig<number | undefined>(
      node.config,
      'minReposterFollowerCount',
      undefined,
    );
    const lastRepostId = this.getOptionalConfig<string | null>(
      node.config,
      'lastRepostId',
      null,
    );

    const result = await this.checker({
      lastRepostId,
      minReposterFollowerCount,
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
        matched: true,
        platform,
        postId: result.postId,
        reposterId: result.reposterId,
      },
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }
}

export function createNewRepostTriggerExecutor(): NewRepostTriggerExecutor {
  return new NewRepostTriggerExecutor();
}
