import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type MixMode = 'replace' | 'mix' | 'background';

export interface SoundOverlayResult {
  outputVideoUrl: string;
  jobId: string;
}

export type SoundOverlayProcessor = (params: {
  organizationId: string;
  videoUrl: string;
  soundUrl: string;
  mixMode: MixMode;
  audioVolume: number;
  videoVolume: number;
  fadeIn: number;
  fadeOut: number;
}) => Promise<SoundOverlayResult>;

/**
 * Sound Overlay Executor
 *
 * Adds an audio track to a generated video using FFmpeg.
 * Supports replace, mix, and background modes with volume controls.
 *
 * Node Type: soundOverlay
 * Definition: @cloud/workflow-saas/nodes/sound-overlay.ts
 */
export class SoundOverlayExecutor extends BaseExecutor {
  readonly nodeType = 'soundOverlay';
  private processor: SoundOverlayProcessor | null = null;

  setProcessor(processor: SoundOverlayProcessor): void {
    this.processor = processor;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const mixMode = node.config.mixMode;
    if (
      mixMode &&
      !['replace', 'mix', 'background'].includes(mixMode as string)
    ) {
      errors.push('Invalid mix mode. Must be: replace, mix, or background');
    }

    const audioVolume = node.config.audioVolume;
    if (
      audioVolume !== undefined &&
      (typeof audioVolume !== 'number' || audioVolume < 0 || audioVolume > 200)
    ) {
      errors.push('Audio volume must be between 0 and 200');
    }

    const videoVolume = node.config.videoVolume;
    if (
      videoVolume !== undefined &&
      (typeof videoVolume !== 'number' || videoVolume < 0 || videoVolume > 200)
    ) {
      errors.push('Video volume must be between 0 and 200');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 2; // Video processing costs 2 credits
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.processor) {
      throw new Error('Sound overlay processor not configured');
    }

    const videoUrl = this.getRequiredInput<string>(inputs, 'videoUrl');
    const soundUrl = this.getRequiredInput<string>(inputs, 'soundUrl');

    const mixMode = this.getOptionalConfig<MixMode>(
      node.config,
      'mixMode',
      'replace',
    );
    const audioVolume = this.getOptionalConfig<number>(
      node.config,
      'audioVolume',
      100,
    );
    const videoVolume = this.getOptionalConfig<number>(
      node.config,
      'videoVolume',
      0,
    );
    const fadeIn = this.getOptionalConfig<number>(node.config, 'fadeIn', 0);
    const fadeOut = this.getOptionalConfig<number>(node.config, 'fadeOut', 0);

    const result = await this.processor({
      audioVolume,
      fadeIn,
      fadeOut,
      mixMode,
      organizationId: context.organizationId,
      soundUrl,
      videoUrl,
      videoVolume,
    });

    return {
      data: result.outputVideoUrl,
      metadata: {
        jobId: result.jobId,
        mixMode,
      },
    };
  }
}

export function createSoundOverlayExecutor(
  processor?: SoundOverlayProcessor,
): SoundOverlayExecutor {
  const executor = new SoundOverlayExecutor();
  if (processor) {
    executor.setProcessor(processor);
  }
  return executor;
}
