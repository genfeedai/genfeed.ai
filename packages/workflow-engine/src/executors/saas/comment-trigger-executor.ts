import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type CommentTriggerPlatform =
  | 'youtube'
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'reddit';

export interface CommentTriggerOutput {
  commentId: string;
  text: string;
  platform: CommentTriggerPlatform;
  authorId?: string;
  authorUsername?: string;
  commentedAt?: string;
  contentId?: string;
  contentUrl?: string;
  parentId?: string;
  postId?: string;
  videoId?: string;
}

export type CommentChecker = (params: {
  organizationId: string;
  platform: CommentTriggerPlatform;
  brandId?: string;
  contentIds: string[];
  keywords: string[];
  excludeKeywords: string[];
  lastCommentId: string | null;
}) => Promise<CommentTriggerOutput | null>;

export class CommentTriggerExecutor extends BaseExecutor {
  readonly nodeType = 'commentTrigger';
  private checker: CommentChecker | null = null;

  setChecker(checker: CommentChecker): void {
    this.checker = checker;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: CommentTriggerPlatform[] = [
      'youtube',
      'instagram',
      'twitter',
      'tiktok',
      'reddit',
    ];
    if (
      !platform ||
      !validPlatforms.includes(platform as CommentTriggerPlatform)
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
      throw new Error('Comment checker not configured');
    }

    const platform = this.getRequiredConfig<CommentTriggerPlatform>(
      node.config,
      'platform',
    );
    const brandId = this.getOptionalConfig<string | undefined>(
      node.config,
      'brandId',
      undefined,
    );
    const contentIds = this.getOptionalConfig<string[]>(
      node.config,
      'contentIds',
      [],
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
    const lastCommentId = this.getOptionalConfig<string | null>(
      node.config,
      'lastCommentId',
      null,
    );

    const result = await this.checker({
      brandId,
      contentIds,
      excludeKeywords,
      keywords,
      lastCommentId,
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
        commentId: result.commentId,
        contentId: result.contentId,
        matched: true,
        platform,
      },
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }
}
