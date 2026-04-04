import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export type KeywordTriggerPlatform = 'twitter' | 'instagram' | 'threads';

export type KeywordMatchMode = 'exact' | 'contains' | 'regex';

export interface KeywordTriggerOutput {
  /** The post/tweet ID containing the keyword match */
  postId: string;
  /** URL of the post */
  postUrl: string;
  /** Full text of the post */
  text: string;
  /** The keyword or phrase that matched */
  matchedKeyword: string;
  /** Author user ID */
  authorId: string;
  /** Author username */
  authorUsername: string;
  /** Platform */
  platform: KeywordTriggerPlatform;
  /** Timestamp of the post */
  detectedAt: string;
}

export type KeywordChecker = (params: {
  organizationId: string;
  platform: KeywordTriggerPlatform;
  keywords: string[];
  excludeKeywords: string[];
  matchMode: KeywordMatchMode;
  caseSensitive: boolean;
  lastPostId: string | null;
}) => Promise<KeywordTriggerOutput | null>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Keyword Trigger Executor
 *
 * Starts a workflow when a keyword or phrase is detected in incoming social posts.
 * Polls posts at configurable intervals and deduplicates.
 *
 * Node Type: keywordTrigger
 */
export class KeywordTriggerExecutor extends BaseExecutor {
  readonly nodeType = 'keywordTrigger';
  private checker: KeywordChecker | null = null;

  setChecker(checker: KeywordChecker): void {
    this.checker = checker;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: KeywordTriggerPlatform[] = [
      'twitter',
      'instagram',
      'threads',
    ];
    if (
      !platform ||
      !validPlatforms.includes(platform as KeywordTriggerPlatform)
    ) {
      errors.push(
        `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
      );
    }

    const keywords = node.config.keywords;
    if (!Array.isArray(keywords) || keywords.length === 0) {
      errors.push('At least one keyword is required');
    }

    const matchMode = node.config.matchMode;
    const validMatchModes: KeywordMatchMode[] = ['exact', 'contains', 'regex'];
    if (
      matchMode !== undefined &&
      !validMatchModes.includes(matchMode as KeywordMatchMode)
    ) {
      errors.push(
        `Invalid match mode. Must be one of: ${validMatchModes.join(', ')}`,
      );
    }

    return { errors, valid: errors.length === 0 };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, context } = input;

    if (!this.checker) {
      throw new Error('Keyword checker not configured');
    }

    const platform = this.getRequiredConfig<KeywordTriggerPlatform>(
      node.config,
      'platform',
    );
    const keywords = this.getRequiredConfig<string[]>(node.config, 'keywords');
    const excludeKeywords = this.getOptionalConfig<string[]>(
      node.config,
      'excludeKeywords',
      [],
    );
    const matchMode = this.getOptionalConfig<KeywordMatchMode>(
      node.config,
      'matchMode',
      'contains',
    );
    const caseSensitive = this.getOptionalConfig<boolean>(
      node.config,
      'caseSensitive',
      false,
    );
    const lastPostId = this.getOptionalConfig<string | null>(
      node.config,
      'lastPostId',
      null,
    );

    const result = await this.checker({
      caseSensitive,
      excludeKeywords,
      keywords,
      lastPostId,
      matchMode,
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
        matchedKeyword: result.matchedKeyword,
        platform,
        postId: result.postId,
      },
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }
}

export function createKeywordTriggerExecutor(): KeywordTriggerExecutor {
  return new KeywordTriggerExecutor();
}
