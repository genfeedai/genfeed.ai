import type { VideoGenerationIdentityLock } from '@genfeedai/contracts/interfaces';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import { buildVideoGenerationResolverRequest } from './media-generation-resolver-request';

export interface VideoGenOutput {
  // `id` and `status` mirror the pending ingredient the resolver creates before
  // handing off to the provider; the `videoGen` action contract requires both.
  id: string;
  status: string;
  filename?: string;
  generationBriefEvidence?: Record<string, unknown>;
  generationSource?: string;
  /**
   * Recorded when the segment ran with run-level identity stills (#4653):
   * which stills were sent and whether a frame role was dropped for them.
   */
  identityLock?: VideoGenerationIdentityLock;
  model: string;
  provider: string;
  videoUrl: string;
}

export type VideoGenResolver = (
  model: string,
  params: Record<string, unknown>,
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<VideoGenOutput>;

export class VideoGenExecutor extends BaseExecutor {
  readonly nodeType = 'videoGen';
  private resolver: VideoGenResolver | null = null;

  setResolver(resolver: VideoGenResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const model = node.config.model;
    if (!model || typeof model !== 'string') {
      errors.push('Model is required for video generation');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 10;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;

    if (!this.resolver) {
      throw new Error('VideoGen resolver not configured');
    }

    const { model, params } = buildVideoGenerationResolverRequest(node, inputs);

    const result = await this.resolver(model, params, input.context, node);

    return {
      data: result,
      metadata: {
        filename: result.filename,
        model,
        provider: result.provider,
      },
    };
  }
}
