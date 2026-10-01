import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import { buildImageGenerationResolverRequest } from './media-generation-resolver-request';

export interface ImageGenOutput {
  // `id` and `status` mirror the pending ingredient the resolver creates before
  // handing off to the provider; the `imageGen` action contract requires both.
  id: string;
  status: string;
  imageUrl: string;
  // Uint8Array (not node's Buffer) keeps the engine package node-free; Buffer
  // is a Uint8Array subclass so runtime resolver values remain assignable.
  imageBuffer?: Uint8Array;
  filename?: string;
  generationBriefEvidence?: Record<string, unknown>;
  generationSource?: string;
  model: string;
  provider: string;
}

/**
 * Resolver that generates an image using the specified model/provider.
 * The actual implementation is injected at runtime from the NestJS service layer.
 */
export type ImageGenResolver = (
  model: string,
  params: Record<string, unknown>,
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<ImageGenOutput>;

export class ImageGenExecutor extends BaseExecutor {
  readonly nodeType = 'imageGen';
  private resolver: ImageGenResolver | null = null;

  setResolver(resolver: ImageGenResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const model = node.config.model;
    if (!model || typeof model !== 'string') {
      errors.push('Model is required for image generation');
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
      throw new Error('ImageGen resolver not configured');
    }

    const { model, params } = buildImageGenerationResolverRequest(node, inputs);

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
