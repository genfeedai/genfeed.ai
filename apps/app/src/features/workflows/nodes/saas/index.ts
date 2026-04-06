export {
  BrandAssetNode,
  brandAssetNodeDefaults,
} from '@/features/workflows/nodes/saas/BrandAssetNode';
export {
  BrandContextNode,
  brandContextNodeDefaults,
} from '@/features/workflows/nodes/saas/BrandContextNode';
export {
  BrandNode,
  brandNodeDefaults,
} from '@/features/workflows/nodes/saas/BrandNode';
export {
  PersonaContentPlanNode,
  personaContentPlanNodeDefaults,
} from '@/features/workflows/nodes/saas/PersonaContentPlanNode';
export {
  PersonaPhotoSessionNode,
  personaPhotoSessionNodeDefaults,
} from '@/features/workflows/nodes/saas/PersonaPhotoSessionNode';
export {
  PersonaVideoContentNode,
  personaVideoContentNodeDefaults,
} from '@/features/workflows/nodes/saas/PersonaVideoContentNode';
export {
  PublishNode,
  publishNodeDefaults,
} from '@/features/workflows/nodes/saas/PublishNode';

import { BrandAssetNode } from '@/features/workflows/nodes/saas/BrandAssetNode';
import { BrandContextNode } from '@/features/workflows/nodes/saas/BrandContextNode';
import { BrandNode } from '@/features/workflows/nodes/saas/BrandNode';
import { PersonaContentPlanNode } from '@/features/workflows/nodes/saas/PersonaContentPlanNode';
import { PersonaPhotoSessionNode } from '@/features/workflows/nodes/saas/PersonaPhotoSessionNode';
import { PersonaVideoContentNode } from '@/features/workflows/nodes/saas/PersonaVideoContentNode';
import { PublishNode } from '@/features/workflows/nodes/saas/PublishNode';

/**
 * SaaS node types for React Flow
 * Merge with core + extended nodeTypes when setting up the workflow canvas
 */
export const saasNodeTypes = {
  brand: BrandNode,
  brandAsset: BrandAssetNode,
  brandContext: BrandContextNode,
  personaContentPlan: PersonaContentPlanNode,
  personaPhotoSession: PersonaPhotoSessionNode,
  personaVideoContent: PersonaVideoContentNode,
  publish: PublishNode,
};
