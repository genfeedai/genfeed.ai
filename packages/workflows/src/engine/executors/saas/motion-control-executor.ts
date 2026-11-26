import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import { buildMotionControlResolverRequest } from './media-generation-resolver-request';

export interface MotionControlOutput {
  // `id` and `status` mirror the pending ingredient the resolver creates before
  // handing off to the provider; the `motionControl` action contract requires both.
  id: string;
  status: string;
  generationBriefEvidence?: Record<string, unknown>;
  generationSource?: string;
  model: string;
  provider: string;
  videoUrl: string;
}

export type MotionControlResolver = (
  model: string,
  params: Record<string, unknown>,
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<MotionControlOutput>;

export class MotionControlExecutor extends BaseExecutor {
  readonly nodeType = 'motionControl';
  private resolver: MotionControlResolver | null = null;

  setResolver(resolver: MotionControlResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const model = node.config.model;
    if (!model || typeof model !== 'string') {
      errors.push('Model is required for motion control');
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
      throw new Error('MotionControl resolver not configured');
    }

    const { model, params } = buildMotionControlResolverRequest(node, inputs);

    const result = await this.resolver(model, params, input.context, node);

    return {
      data: result,
      metadata: {
        model,
        provider: result.provider,
      },
    };
  }
}
