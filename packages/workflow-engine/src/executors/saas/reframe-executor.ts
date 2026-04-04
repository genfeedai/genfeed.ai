import type { ExecutionContext } from '@workflow-engine/execution/engine';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface ReframeOutput {
  mediaUrl: string;
  format: string;
  targetAspectRatio: string;
}

/**
 * Resolver that reframes an image or video to a target aspect ratio.
 * Injected at runtime from the NestJS service layer (Replicate/Luma).
 */
export type ReframeResolver = (
  mediaUrl: string,
  params: { format: string; targetAspectRatio: string },
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<ReframeOutput>;

export class ReframeExecutor extends BaseExecutor {
  readonly nodeType = 'reframe';
  private resolver: ReframeResolver | null = null;

  setResolver(resolver: ReframeResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const targetAspectRatio = node.config.targetAspectRatio;
    if (!targetAspectRatio || typeof targetAspectRatio !== 'string') {
      errors.push('Target aspect ratio is required for reframing');
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
      throw new Error('Reframe resolver not configured');
    }

    const mediaUrl = inputs.get('media') as string;
    if (!mediaUrl) {
      throw new Error('Media input is required for reframing');
    }

    const targetAspectRatio = this.getRequiredConfig<string>(
      node.config,
      'targetAspectRatio',
    );
    const format = this.getOptionalConfig<string>(
      node.config,
      'format',
      'landscape',
    );

    const result = await this.resolver(
      mediaUrl,
      { format, targetAspectRatio },
      input.context,
      node,
    );

    return {
      data: result,
      metadata: {
        format: result.format,
        targetAspectRatio: result.targetAspectRatio,
      },
    };
  }
}

export function createReframeExecutor(): ReframeExecutor {
  return new ReframeExecutor();
}
