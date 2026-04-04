import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface VideoInputResult {
  videoFiles: string[];
  totalDuration: number;
  videoCount: number;
}

export type VideoInputValidator = (params: {
  organizationId: string;
  videoUrls: string[];
  maxVideos: number;
  minClipDuration: number;
}) => Promise<VideoInputResult>;

/**
 * Video Input Executor
 *
 * Accepts multiple video URLs as input for beat-synced editing.
 * Validates and resolves video files, calculates total duration.
 *
 * Node Type: videoInput
 * Definition: @cloud/workflow-saas/nodes/video-input.ts
 */
export class VideoInputExecutor extends BaseExecutor {
  readonly nodeType = 'videoInput';
  private validator: VideoInputValidator | null = null;

  setValidator(validator: VideoInputValidator): void {
    this.validator = validator;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const maxVideos = node.config.maxVideos;
    if (
      maxVideos !== undefined &&
      (typeof maxVideos !== 'number' || maxVideos < 1 || maxVideos > 50)
    ) {
      errors.push('Max videos must be between 1 and 50');
    }

    const minClipDuration = node.config.minClipDuration;
    if (
      minClipDuration !== undefined &&
      (typeof minClipDuration !== 'number' ||
        minClipDuration < 0.1 ||
        minClipDuration > 60)
    ) {
      errors.push('Min clip duration must be between 0.1 and 60 seconds');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 1; // Basic validation costs 1 credit
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.validator) {
      throw new Error('Video input validator not configured');
    }

    // Get video URLs from input (can be array or single value)
    const rawVideoUrls = inputs.get('videoUrls');
    let videoUrls: string[];

    if (Array.isArray(rawVideoUrls)) {
      videoUrls = rawVideoUrls.filter(
        (url): url is string => typeof url === 'string',
      );
    } else if (typeof rawVideoUrls === 'string') {
      videoUrls = [rawVideoUrls];
    } else {
      throw new Error('Missing required input: videoUrls');
    }

    if (videoUrls.length === 0) {
      throw new Error('At least one video URL is required');
    }

    const maxVideos = this.getOptionalConfig<number>(
      node.config,
      'maxVideos',
      10,
    );
    const minClipDuration = this.getOptionalConfig<number>(
      node.config,
      'minClipDuration',
      0.5,
    );

    const result = await this.validator({
      maxVideos,
      minClipDuration,
      organizationId: context.organizationId,
      videoUrls,
    });

    return {
      data: result.videoFiles,
      metadata: {
        totalDuration: result.totalDuration,
        videoCount: result.videoCount,
      },
    };
  }
}

export function createVideoInputExecutor(
  validator?: VideoInputValidator,
): VideoInputExecutor {
  const executor = new VideoInputExecutor();
  if (validator) {
    executor.setValidator(validator);
  }
  return executor;
}
