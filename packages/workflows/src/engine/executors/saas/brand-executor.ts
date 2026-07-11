import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface BrandContextOutput {
  brandId: string;
  label: string;
  handle: string;
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

export type BrandResolver = (
  brandId: string,
  organizationId: string,
) => Promise<BrandContextOutput | null>;

export class BrandExecutor extends BaseExecutor {
  readonly nodeType = 'brand';
  private resolver: BrandResolver | null = null;

  setResolver(resolver: BrandResolver): void {
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
      throw new Error('Brand resolver not configured');
    }

    const brandId = this.getRequiredConfig<string>(node.config, 'brandId');
    const brandContext = await this.resolver(brandId, context.organizationId);

    if (!brandContext) {
      throw new Error(`Brand ${brandId} not found or not accessible`);
    }

    return {
      data: brandContext,
      metadata: {
        brandId: brandContext.brandId,
        brandLabel: brandContext.label,
      },
    };
  }
}

export function createBrandExecutor(resolver?: BrandResolver): BrandExecutor {
  const executor = new BrandExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
