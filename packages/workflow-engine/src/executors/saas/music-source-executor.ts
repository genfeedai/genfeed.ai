import { MusicSourceType } from '@genfeedai/enums';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface MusicSourceResult {
  musicUrl: string;
  duration: number;
  tempo: number | null;
  title: string;
  artist: string | null;
}

export type MusicSourceResolver = (params: {
  organizationId: string;
  sourceType: MusicSourceType;
  trendPlatform?: 'tiktok' | 'instagram' | null;
  trendMinUsage?: number;
  libraryCategory?: string | null;
  libraryMood?: string | null;
  uploadUrl?: string | null;
  generatePrompt?: string | null;
  generateDuration?: number;
}) => Promise<MusicSourceResult>;

/**
 * Music Source Executor
 *
 * Resolves music from various sources for beat-synced editing.
 * Supports trending sounds, curated library, user uploads, and AI generation.
 *
 * Node Type: musicSource
 * Definition: @cloud/workflow-saas/nodes/music-source.ts
 */
export class MusicSourceExecutor extends BaseExecutor {
  readonly nodeType = 'musicSource';
  private resolver: MusicSourceResolver | null = null;

  setResolver(resolver: MusicSourceResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const sourceType = node.config.sourceType;
    if (
      sourceType &&
      !Object.values(MusicSourceType).includes(sourceType as MusicSourceType)
    ) {
      errors.push(
        `Invalid source type. Must be one of: ${Object.values(MusicSourceType).join(', ')}`,
      );
    }

    const generateDuration = node.config.generateDuration;
    if (
      generateDuration !== undefined &&
      (typeof generateDuration !== 'number' ||
        generateDuration < 5 ||
        generateDuration > 300)
    ) {
      errors.push('Generate duration must be between 5 and 300 seconds');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(node: ExecutableNode): number {
    const sourceType = node.config.sourceType as MusicSourceType;
    switch (sourceType) {
      case MusicSourceType.GENERATE:
        return 5; // AI generation costs more
      case MusicSourceType.TREND_SOUND:
        return 2; // Trend lookup costs credits
      default:
        return 1; // Library and upload are cheaper
    }
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.resolver) {
      throw new Error('Music source resolver not configured');
    }

    const sourceType = this.getOptionalConfig<MusicSourceType>(
      node.config,
      'sourceType',
      MusicSourceType.LIBRARY,
    );
    const trendPlatform = this.getOptionalConfig<'tiktok' | 'instagram' | null>(
      node.config,
      'trendPlatform',
      null,
    );
    const trendMinUsage = this.getOptionalConfig<number>(
      node.config,
      'trendMinUsage',
      10000,
    );
    const libraryCategory = this.getOptionalConfig<string | null>(
      node.config,
      'libraryCategory',
      null,
    );
    const libraryMood = this.getOptionalConfig<string | null>(
      node.config,
      'libraryMood',
      null,
    );
    const generateDuration = this.getOptionalConfig<number>(
      node.config,
      'generateDuration',
      30,
    );

    // Get optional inputs
    const uploadUrl = inputs.get('uploadUrl') as string | null;
    const generatePrompt = inputs.get('generatePrompt') as string | null;

    const result = await this.resolver({
      generateDuration,
      generatePrompt,
      libraryCategory,
      libraryMood,
      organizationId: context.organizationId,
      sourceType,
      trendMinUsage,
      trendPlatform,
      uploadUrl,
    });

    return {
      data: result.musicUrl,
      metadata: {
        artist: result.artist,
        duration: result.duration,
        tempo: result.tempo,
        title: result.title,
      },
    };
  }
}

export function createMusicSourceExecutor(
  resolver?: MusicSourceResolver,
): MusicSourceExecutor {
  const executor = new MusicSourceExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
