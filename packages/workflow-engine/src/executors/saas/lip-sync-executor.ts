import type { ExecutionContext } from '@workflow-engine/execution/engine';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface LipSyncResult {
  videoUrl: string;
}

/**
 * Resolver that generates a lip-synced video from media + audio.
 * The actual implementation is injected at runtime from the NestJS service layer.
 */
export type LipSyncResolver = (
  mediaUrl: string,
  audioUrl: string,
  options: { mode?: 'video' | 'image' },
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<LipSyncResult>;

/**
 * Lip Sync Executor
 *
 * Generates a lip-synced video from a source image/video and audio input.
 * Uses HeyGen (or another provider) as the backend for lip sync generation.
 *
 * Node Type: lipSync
 * Category: ai
 */
export class LipSyncExecutor extends BaseExecutor {
  readonly nodeType = 'lipSync';
  private resolver: LipSyncResolver | null = null;

  setResolver(resolver: LipSyncResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const mode = node.config.mode;
    if (mode && !['video', 'image'].includes(mode as string)) {
      errors.push('Invalid mode. Must be: video or image');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 10; // Lip sync is compute-heavy
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;

    if (!this.resolver) {
      throw new Error('LipSync resolver not configured');
    }

    // Media can come from 'video' or 'image' input port
    const mediaUrl =
      (inputs.get('video') as string) ?? (inputs.get('image') as string);

    if (!mediaUrl) {
      throw new Error('Missing required input: video or image');
    }

    const audioUrl = this.getRequiredInput<string>(inputs, 'audio');
    const mode = this.getOptionalConfig<'video' | 'image'>(
      node.config,
      'mode',
      'image',
    );

    const result = await this.resolver(
      mediaUrl,
      audioUrl,
      { mode },
      input.context,
      node,
    );

    return {
      data: result,
      metadata: {
        mode,
      },
    };
  }
}

export function createLipSyncExecutor(): LipSyncExecutor {
  return new LipSyncExecutor();
}
