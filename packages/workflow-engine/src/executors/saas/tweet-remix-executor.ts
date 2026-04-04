import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type TweetTone = 'professional' | 'casual' | 'witty' | 'viral';

export interface TweetVariation {
  id: string;
  text: string;
  charCount: number;
}

export interface TweetRemixResult {
  variations: TweetVariation[];
  selectedText: string;
}

export type TweetRemixer = (params: {
  inputTweet: string;
  tone: TweetTone;
  maxLength: number;
}) => Promise<TweetRemixResult>;

/**
 * Tweet Remix Executor
 *
 * Generates tweet variations using AI based on tone and length preferences.
 * Used for social media content creation workflows.
 *
 * Node Type: tweetRemix
 * Definition: @cloud/workflow-saas/nodes/tweet-remix.ts
 */
export class TweetRemixExecutor extends BaseExecutor {
  readonly nodeType = 'tweetRemix';
  private remixer: TweetRemixer | null = null;

  setRemixer(remixer: TweetRemixer): void {
    this.remixer = remixer;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const tone = node.config.tone;
    if (
      tone &&
      !['professional', 'casual', 'witty', 'viral'].includes(tone as string)
    ) {
      errors.push(
        'Invalid tone. Must be: professional, casual, witty, or viral',
      );
    }

    const maxLength = node.config.maxLength;
    if (
      maxLength !== undefined &&
      (typeof maxLength !== 'number' || maxLength < 1 || maxLength > 500)
    ) {
      errors.push('Max length must be between 1 and 500');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 1; // AI generation costs 1 credit
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;

    if (!this.remixer) {
      throw new Error('Tweet remixer not configured');
    }

    const inputTweet = this.getRequiredInput<string>(inputs, 'text');
    const tone = this.getOptionalConfig<TweetTone>(
      node.config,
      'tone',
      'professional',
    );
    const maxLength = this.getOptionalConfig<number>(
      node.config,
      'maxLength',
      280,
    );

    const result = await this.remixer({
      inputTweet,
      maxLength,
      tone,
    });

    return {
      data: result.selectedText,
      metadata: {
        tone,
        variationCount: result.variations.length,
        variations: result.variations,
      },
    };
  }
}

export function createTweetRemixExecutor(
  remixer?: TweetRemixer,
): TweetRemixExecutor {
  const executor = new TweetRemixExecutor();
  if (remixer) {
    executor.setRemixer(remixer);
  }
  return executor;
}
