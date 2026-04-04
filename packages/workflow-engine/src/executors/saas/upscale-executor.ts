import type { ExecutionContext } from '@workflow-engine/execution/engine';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface UpscaleOutput {
  mediaUrl: string;
  model: string;
  scale: string;
}

/**
 * Resolver that upscales media (image or video) using AI.
 * Injected at runtime from the NestJS service layer (Replicate/Topaz).
 */
export type UpscaleResolver = (
  mediaUrl: string,
  params: { model: string; scale: string },
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<UpscaleOutput>;

export class UpscaleExecutor extends BaseExecutor {
  readonly nodeType = 'upscale';
  private resolver: UpscaleResolver | null = null;

  setResolver(resolver: UpscaleResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const model = node.config.model;
    if (!model || typeof model !== 'string') {
      errors.push('Model is required for upscaling');
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
      throw new Error('Upscale resolver not configured');
    }

    const mediaUrl = inputs.get('media') as string;
    if (!mediaUrl) {
      throw new Error('Media input is required for upscaling');
    }

    const model = this.getRequiredConfig<string>(node.config, 'model');
    const scale = this.getOptionalConfig<string>(node.config, 'scale', '2x');

    const result = await this.resolver(
      mediaUrl,
      { model, scale },
      input.context,
      node,
    );

    return {
      data: result,
      metadata: {
        model: result.model,
        scale: result.scale,
      },
    };
  }
}

export function createUpscaleExecutor(): UpscaleExecutor {
  return new UpscaleExecutor();
}
