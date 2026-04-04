import type { ICreativePattern, PatternType } from '@cloud/interfaces';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type PatternContextResolver = (
  brandId: string,
  organizationId: string,
  options?: { limit?: number; patternTypes?: PatternType[] },
) => Promise<ICreativePattern[]>;

/**
 * Pattern Context Executor
 *
 * Retrieves proven creative patterns for a brand from performance data
 * and makes them available to downstream workflow nodes.
 *
 * Node Type: patternContext
 * Definition: @cloud/workflow-saas/nodes/pattern-context.ts
 */
export class PatternContextExecutor extends BaseExecutor {
  readonly nodeType = 'patternContext';
  private resolver: PatternContextResolver | null = null;

  setResolver(resolver: PatternContextResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const brandId = node.config.brandId;
    if (!brandId || typeof brandId !== 'string') {
      errors.push('Brand ID is required');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, context } = input;

    if (!this.resolver) {
      throw new Error('Pattern context resolver not configured');
    }

    const brandId = this.getRequiredConfig<string>(node.config, 'brandId');
    const limit = this.getOptionalConfig<number>(node.config, 'limit', 10);
    const patternTypes = this.getOptionalConfig<PatternType[]>(
      node.config,
      'patternTypes',
      [],
    );

    const patterns = await this.resolver(brandId, context.organizationId, {
      limit,
      patternTypes: patternTypes.length > 0 ? patternTypes : undefined,
    });

    return {
      data: { patterns },
      metadata: {
        brandId,
        patternCount: patterns.length,
      },
    };
  }
}

export function createPatternContextExecutor(
  resolver?: PatternContextResolver,
): PatternContextExecutor {
  const executor = new PatternContextExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
