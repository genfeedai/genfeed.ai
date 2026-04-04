import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface BrandContextResolverOutput {
  brandId: string;
  label: string;
  slug: string;
  voice: string | null;
  colors: {
    primary: string;
    secondary: string;
    background: string;
  } | null;
  fonts: string | null;
  models: {
    video: string | null;
    image: string | null;
    imageToVideo: string | null;
    music: string | null;
  } | null;
}

export type BrandContextResolver = (
  brandId: string,
  organizationId: string,
) => Promise<BrandContextResolverOutput | null>;

/**
 * Brand Context Executor
 *
 * Injects brand styling context (voice, colors, fonts, default models)
 * into downstream workflow nodes.
 *
 * Node Type: brandContext
 * Definition: @cloud/workflow-saas/nodes/brand-context.ts
 */
export class BrandContextExecutor extends BaseExecutor {
  readonly nodeType = 'brandContext';
  private resolver: BrandContextResolver | null = null;

  setResolver(resolver: BrandContextResolver): void {
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
      throw new Error('Brand context resolver not configured');
    }

    const brandId = this.getRequiredConfig<string>(node.config, 'brandId');
    const brandContext = await this.resolver(brandId, context.organizationId);

    if (!brandContext) {
      throw new Error(`Brand ${brandId} not found or not accessible`);
    }

    return {
      data: {
        colors: brandContext.colors,
        fonts: brandContext.fonts,
        models: brandContext.models,
        voice: brandContext.voice,
      },
      metadata: {
        brandId: brandContext.brandId,
        brandLabel: brandContext.label,
        brandSlug: brandContext.slug,
      },
    };
  }
}

export function createBrandContextExecutor(
  resolver?: BrandContextResolver,
): BrandContextExecutor {
  const executor = new BrandContextExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
