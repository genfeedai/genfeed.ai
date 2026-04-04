import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type BrandAssetType = 'logo' | 'banner' | 'references';

export interface AssetDimensions {
  width: number;
  height: number;
}

export interface BrandAssetResolverOutput {
  url: string | null;
  urls: string[];
  dimensions: AssetDimensions | null;
  mimeType: string | null;
}

export type BrandAssetResolver = (params: {
  brandId: string;
  organizationId: string;
  assetType: BrandAssetType;
}) => Promise<BrandAssetResolverOutput | null>;

/**
 * Brand Asset Executor
 *
 * Resolves brand-specific assets (logos, banners, reference images)
 * for use in downstream workflow nodes.
 *
 * Node Type: brandAsset
 * Definition: @genfeedai/workflow-saas/nodes/brand-asset.ts
 */
export class BrandAssetExecutor extends BaseExecutor {
  readonly nodeType = 'brandAsset';
  private resolver: BrandAssetResolver | null = null;

  setResolver(resolver: BrandAssetResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const brandId = node.config.brandId;
    if (!brandId || typeof brandId !== 'string') {
      errors.push('Brand ID is required');
    }

    const assetType = node.config.assetType;
    if (
      !assetType ||
      !['logo', 'banner', 'references'].includes(assetType as string)
    ) {
      errors.push('Valid asset type is required (logo, banner, or references)');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, context } = input;

    if (!this.resolver) {
      throw new Error('Brand asset resolver not configured');
    }

    const brandId = this.getRequiredConfig<string>(node.config, 'brandId');
    const assetType = this.getRequiredConfig<BrandAssetType>(
      node.config,
      'assetType',
    );

    const result = await this.resolver({
      assetType,
      brandId,
      organizationId: context.organizationId,
    });

    if (!result) {
      throw new Error(`Brand asset not found for brand ${brandId}`);
    }

    const isMultiple = assetType === 'references';

    return {
      data: isMultiple ? result.urls : result.url,
      metadata: {
        assetType,
        dimensions: result.dimensions,
        mimeType: result.mimeType,
      },
    };
  }
}

export function createBrandAssetExecutor(
  resolver?: BrandAssetResolver,
): BrandAssetExecutor {
  const executor = new BrandAssetExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
