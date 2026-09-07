import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import { mediaArtifactUrl } from './media-artifact-url';

export interface LipSyncResult {
  videoUrl: string;
}

/**
 * Resolver that generates a lip-synced video from media + audio.
 * The actual implementation is injected at runtime from the NestJS service layer.
 */
export type LipSyncResolver = (
  media: unknown,
  audio: unknown,
  options: { mode?: 'video' | 'image'; model?: string; syncMode?: string },
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

    const videoUrl = mediaArtifactUrl(inputs.get('video'), 'video');
    const imageUrl = mediaArtifactUrl(inputs.get('image'), 'image');
    const mediaUrl = videoUrl ?? imageUrl;

    if (!mediaUrl) {
      throw new Error('Missing required input: video or image');
    }

    const audioUrl = mediaArtifactUrl(inputs.get('audio'), 'audio');
    if (!audioUrl) throw new Error('Missing required input: audio');
    const mode = videoUrl ? 'video' : 'image';
    if (node.config.mode !== undefined && node.config.mode !== mode) {
      throw new Error(
        `Configured lip-sync mode ${String(node.config.mode)} does not match the connected ${mode} source. Change the mode or connect the matching media.`,
      );
    }
    const model = this.getOptionalConfig<string>(
      node.config,
      'model',
      mode === 'image' ? 'heygen/avatar' : 'sync/lipsync-2',
    );
    if (
      (mode === 'image' && model !== 'heygen/avatar') ||
      (mode === 'video' &&
        !['sync/lipsync-2', 'sync/lipsync-2-pro'].includes(model))
    ) {
      throw new Error(`Model ${model} does not support ${mode} lip sync`);
    }
    const syncMode = this.getOptionalConfig<string>(
      node.config,
      'syncMode',
      'loop',
    );
    if (!['loop', 'bounce', 'cut_off', 'silence', 'remap'].includes(syncMode)) {
      throw new Error('Invalid lip-sync timing mode');
    }

    const result = await this.resolver(
      inputs.get(videoUrl ? 'video' : 'image'),
      inputs.get('audio'),
      { mode, model, syncMode },
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
