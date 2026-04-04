import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface VoiceChangeResult {
  audioUrl: string;
}

/**
 * Resolver that converts audio to a different voice using Replicate.
 * The actual implementation is injected at runtime from the NestJS service layer.
 */
export type VoiceChangeResolver = (
  audioUrl: string,
  targetVoiceId: string,
  options?: { pitchShift?: number },
) => Promise<VoiceChangeResult>;

/**
 * Voice Change Executor
 *
 * Changes the voice of an audio file using AI voice conversion models.
 * Uses Replicate as the provider for voice transformation.
 *
 * Node Type: voiceChange
 * Category: ai
 */
export class VoiceChangeExecutor extends BaseExecutor {
  readonly nodeType = 'voiceChange';
  private resolver: VoiceChangeResolver | null = null;

  setResolver(resolver: VoiceChangeResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const targetVoiceId = node.config.targetVoiceId;
    if (!targetVoiceId || typeof targetVoiceId !== 'string') {
      errors.push('Target voice ID is required for voice change');
    }

    const pitchShift = node.config.pitchShift;
    if (
      pitchShift !== undefined &&
      (typeof pitchShift !== 'number' || pitchShift < -12 || pitchShift > 12)
    ) {
      errors.push('Pitch shift must be a number between -12 and 12');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 5;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;

    if (!this.resolver) {
      throw new Error('VoiceChange resolver not configured');
    }

    const audioUrl = this.getRequiredInput<string>(inputs, 'audio');
    const targetVoiceId = this.getRequiredConfig<string>(
      node.config,
      'targetVoiceId',
    );
    const pitchShift = this.getOptionalConfig<number | undefined>(
      node.config,
      'pitchShift',
      undefined,
    );

    const options: { pitchShift?: number } = {};
    if (pitchShift !== undefined) {
      options.pitchShift = pitchShift;
    }

    const result = await this.resolver(audioUrl, targetVoiceId, options);

    return {
      data: result.audioUrl,
      metadata: {
        pitchShift,
        targetVoiceId,
      },
    };
  }
}

export function createVoiceChangeExecutor(): VoiceChangeExecutor {
  return new VoiceChangeExecutor();
}
