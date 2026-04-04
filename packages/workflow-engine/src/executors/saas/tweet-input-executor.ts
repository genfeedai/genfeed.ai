import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type TweetInputMode = 'url' | 'text';

export interface TweetFetchResult {
  text: string;
  authorHandle: string | null;
  tweetId: string | null;
}

export type TweetFetcher = (tweetUrl: string) => Promise<TweetFetchResult>;

/**
 * Tweet Input Executor
 *
 * Fetches tweets from Twitter/X via URL or uses manual text input.
 * Requires Twitter API access for URL fetching mode.
 *
 * Node Type: tweetInput
 * Definition: @genfeedai/workflow-saas/nodes/tweet-input.ts
 */
export class TweetInputExecutor extends BaseExecutor {
  readonly nodeType = 'tweetInput';
  private fetcher: TweetFetcher | null = null;

  setFetcher(fetcher: TweetFetcher): void {
    this.fetcher = fetcher;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const inputMode = node.config.inputMode as TweetInputMode | undefined;

    if (inputMode === 'url') {
      const tweetUrl = node.config.tweetUrl;
      if (!tweetUrl || typeof tweetUrl !== 'string') {
        errors.push('Tweet URL is required when input mode is "url"');
      }
    } else if (inputMode === 'text') {
      const rawText = node.config.rawText;
      if (!rawText || typeof rawText !== 'string') {
        errors.push('Raw text is required when input mode is "text"');
      }
    } else {
      errors.push('Input mode must be "url" or "text"');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node } = input;

    const inputMode = this.getRequiredConfig<TweetInputMode>(
      node.config,
      'inputMode',
    );

    if (inputMode === 'text') {
      const rawText = this.getRequiredConfig<string>(node.config, 'rawText');
      return {
        data: rawText,
        metadata: {
          authorHandle: null,
          inputMode: 'text',
        },
      };
    }

    if (!this.fetcher) {
      throw new Error('Tweet fetcher not configured');
    }

    const tweetUrl = this.getRequiredConfig<string>(node.config, 'tweetUrl');
    const result = await this.fetcher(tweetUrl);

    return {
      data: result.text,
      metadata: {
        authorHandle: result.authorHandle,
        inputMode: 'url',
        tweetId: result.tweetId,
      },
    };
  }
}

export function createTweetInputExecutor(
  fetcher?: TweetFetcher,
): TweetInputExecutor {
  const executor = new TweetInputExecutor();
  if (fetcher) {
    executor.setFetcher(fetcher);
  }
  return executor;
}
