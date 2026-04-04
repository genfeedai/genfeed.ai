import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export type ReplyPlatform = 'twitter' | 'instagram' | 'threads' | 'facebook';

export interface PostReplyConfig {
  /** Platform to reply on */
  platform: ReplyPlatform;
  /** The post/tweet ID to reply to (can come from input) */
  postId?: string;
  /** Reply text (can come from input) */
  text?: string;
  /** Optional media URL to attach */
  mediaUrl?: string;
}

export interface PostReplyResult {
  /** Whether the reply was posted successfully */
  success: boolean;
  /** The ID of the reply post */
  replyId?: string;
  /** URL of the reply post */
  replyUrl?: string;
  /** Platform the reply was posted on */
  platform: ReplyPlatform;
  /** The original post ID that was replied to */
  originalPostId: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Function signature for the injected reply publisher.
 * The NestJS service layer injects the actual implementation at runtime.
 */
export type ReplyPublisher = (params: {
  organizationId: string;
  userId: string;
  /** The brand ID associated with this action. Use this instead of userId for brand-scoped operations. */
  brandId?: string;
  platform: ReplyPlatform;
  postId: string;
  text: string;
  mediaUrl?: string;
}) => Promise<{ replyId: string; replyUrl: string }>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Post Reply Executor
 *
 * Replies to a social media post on the specified platform.
 * Requires a ReplyPublisher to be injected at runtime.
 *
 * Node Type: postReply
 */
export class PostReplyExecutor extends BaseExecutor {
  readonly nodeType = 'postReply';
  private publisher: ReplyPublisher | null = null;

  setPublisher(publisher: ReplyPublisher): void {
    this.publisher = publisher;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: ReplyPlatform[] = [
      'twitter',
      'instagram',
      'threads',
      'facebook',
    ];
    if (!platform || !validPlatforms.includes(platform as ReplyPlatform)) {
      errors.push(
        `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
      );
    }

    return { errors, valid: errors.length === 0 };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.publisher) {
      throw new Error('Reply publisher not configured');
    }

    const platform = this.getRequiredConfig<ReplyPlatform>(
      node.config,
      'platform',
    );

    // postId and text can come from config or from connected inputs
    const postId =
      (node.config.postId as string) ??
      (inputs.get('postId') as string | undefined);
    const text =
      (node.config.text as string) ??
      (inputs.get('text') as string | undefined);

    if (!postId) {
      throw new Error('Post ID is required (via config or input)');
    }
    if (!text) {
      throw new Error('Reply text is required (via config or input)');
    }

    const mediaUrl =
      (node.config.mediaUrl as string) ??
      (inputs.get('mediaUrl') as string | undefined);

    const result = await this.publisher({
      brandId: node.config.brandId as string | undefined,
      mediaUrl,
      organizationId: context.organizationId,
      platform,
      postId,
      text,
      userId: context.userId,
    });

    const replyResult: PostReplyResult = {
      originalPostId: postId,
      platform,
      replyId: result.replyId,
      replyUrl: result.replyUrl,
      success: true,
    };

    return {
      data: replyResult,
      metadata: {
        platform,
        replyId: result.replyId,
        replyUrl: result.replyUrl,
      },
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 1;
  }
}

export function createPostReplyExecutor(): PostReplyExecutor {
  return new PostReplyExecutor();
}
