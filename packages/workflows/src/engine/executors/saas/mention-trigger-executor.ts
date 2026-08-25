import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

// =============================================================================
// TYPES
// =============================================================================

export type MentionTriggerPlatform = 'twitter' | 'instagram' | 'threads';

export interface MentionTriggerOutput {
  /** The post/tweet ID containing the mention */
  postId: string;
  /** URL of the post */
  postUrl: string;
  /** Text of the post */
  text: string;
  /** Author user ID */
  authorId: string;
  /** Author username */
  authorUsername: string;
  /** Platform */
  platform: MentionTriggerPlatform;
  /** Timestamp of the mention */
  mentionedAt: string;
}

export type MentionChecker = (params: {
  organizationId: string;
  platform: MentionTriggerPlatform;
  /** Brand whose connected account this trigger watches. */
  brandId?: string;
  /**
   * Which of the brand's accounts on this platform to watch. A brand may hold
   * several; omitted watches the brand's default account.
   */
  credentialId?: string;
  keywords?: string[];
  excludeKeywords?: string[];
  lastMentionId: string | null;
}) => Promise<MentionTriggerOutput | null>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Mention Trigger Executor
 *
 * Starts a workflow when the authenticated user is mentioned.
 * Polls mentions at configurable intervals and deduplicates.
 *
 * Node Type: mentionTrigger
 */
export class MentionTriggerExecutor extends BaseExecutor {
  readonly nodeType = 'mentionTrigger';
  private checker: MentionChecker | null = null;

  setChecker(checker: MentionChecker): void {
    this.checker = checker;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: MentionTriggerPlatform[] = [
      'twitter',
      'instagram',
      'threads',
    ];
    if (
      !platform ||
      !validPlatforms.includes(platform as MentionTriggerPlatform)
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
      throw new Error('Mention checker not configured');
    }

    const platform = this.getRequiredConfig<MentionTriggerPlatform>(
      node.config,
      'platform',
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
    const lastMentionId = this.getOptionalConfig<string | null>(
      node.config,
      'lastMentionId',
      null,
    );

    const result = await this.checker({
      brandId: node.config.brandId as string | undefined,
      credentialId: node.config.credentialId as string | undefined,
      excludeKeywords,
      keywords,
      lastMentionId,
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
