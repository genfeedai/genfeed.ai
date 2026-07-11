import { BrandAssetNode } from '@/features/workflows/nodes/saas/BrandAssetNode';
import { BrandContextNode } from '@/features/workflows/nodes/saas/BrandContextNode';
import { BrandNode } from '@/features/workflows/nodes/saas/BrandNode';
import { HookGeneratorNode } from '@/features/workflows/nodes/saas/HookGeneratorNode';
import { PublishNode } from '@/features/workflows/nodes/saas/PublishNode';

/**
 * SaaS node types for React Flow
 * Merge with core + extended nodeTypes when setting up the workflow canvas
 */
export const saasNodeTypes = {
  brand: BrandNode,
  brandAsset: BrandAssetNode,
  brandContext: BrandContextNode,
  hookGenerator: HookGeneratorNode,
  publish: PublishNode,
};
