export {
  BrandAssetNode,
  brandAssetNodeDefaults,
} from '@workflow-cloud/nodes/saas/BrandAssetNode';
export {
  BrandContextNode,
  brandContextNodeDefaults,
} from '@workflow-cloud/nodes/saas/BrandContextNode';
export {
  BrandNode,
  brandNodeDefaults,
} from '@workflow-cloud/nodes/saas/BrandNode';
export {
  PersonaContentPlanNode,
  personaContentPlanNodeDefaults,
} from '@workflow-cloud/nodes/saas/PersonaContentPlanNode';
export {
  PersonaPhotoSessionNode,
  personaPhotoSessionNodeDefaults,
} from '@workflow-cloud/nodes/saas/PersonaPhotoSessionNode';
export {
  PersonaVideoContentNode,
  personaVideoContentNodeDefaults,
} from '@workflow-cloud/nodes/saas/PersonaVideoContentNode';
export {
  PublishNode,
  publishNodeDefaults,
} from '@workflow-cloud/nodes/saas/PublishNode';

import { BrandAssetNode } from '@workflow-cloud/nodes/saas/BrandAssetNode';
import { BrandContextNode } from '@workflow-cloud/nodes/saas/BrandContextNode';
import { BrandNode } from '@workflow-cloud/nodes/saas/BrandNode';
import { PersonaContentPlanNode } from '@workflow-cloud/nodes/saas/PersonaContentPlanNode';
import { PersonaPhotoSessionNode } from '@workflow-cloud/nodes/saas/PersonaPhotoSessionNode';
import { PersonaVideoContentNode } from '@workflow-cloud/nodes/saas/PersonaVideoContentNode';
import { PublishNode } from '@workflow-cloud/nodes/saas/PublishNode';

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
