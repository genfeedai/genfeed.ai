import type { ExecutionContext } from '@workflow-engine/execution/engine';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface TtsResult {
  audioUrl: string;
  duration: number;
}

/**
 * Resolver that generates speech audio from text using a TTS provider.
 * The actual implementation is injected at runtime from the NestJS service layer.
 */
export type TtsResolver = (
  text: string,
  voiceId: string,
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<TtsResult>;

/**
 * Text to Speech Executor
 *
 * Converts text input into speech audio using ElevenLabs (or another provider).
 * Text can come from an upstream input port or from node config.
 *
 * Node Type: textToSpeech
 * Category: ai
 */
export class TextToSpeechExecutor extends BaseExecutor {
  readonly nodeType = 'textToSpeech';
  private resolver: TtsResolver | null = null;

  setResolver(resolver: TtsResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const voiceId = node.config.voiceId;
    if (!voiceId || typeof voiceId !== 'string') {
      errors.push('Voice ID is required for text to speech');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 3;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;

    if (!this.resolver) {
      throw new Error('TextToSpeech resolver not configured');
    }

    // Text can come from input port or config
    const text =
      (inputs.get('text') as string) ??
      this.getOptionalConfig<string>(node.config, 'text', '');

    if (!text) {
      throw new Error(
        'Text is required: provide via input port or node config',
      );
    }

    const voiceId = this.getRequiredConfig<string>(node.config, 'voiceId');

    const result = await this.resolver(text, voiceId, input.context, node);

    return {
      data: result,
      metadata: {
        duration: result.duration,
        voiceId,
      },
    };
  }
}

export function createTextToSpeechExecutor(): TextToSpeechExecutor {
  return new TextToSpeechExecutor();
}
