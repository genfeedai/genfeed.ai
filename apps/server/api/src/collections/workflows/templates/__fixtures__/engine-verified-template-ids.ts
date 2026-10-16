import { SHOWCASE_WORKFLOW_TEMPLATE_IDS } from '@api/collections/workflows/templates/showcase-workflow-template-ids';

/**
 * Starter templates held to a clean run on the real workflow engine and kept
 * off the known-defect baselines (#5510). The showcase set is the Featured
 * fallback; the avatar graphs stay here so a later pin still copies a graph
 * the engine spec has run.
 */
export const ENGINE_VERIFIED_TEMPLATE_IDS = [
  ...SHOWCASE_WORKFLOW_TEMPLATE_IDS,
  'avatar-ugc-x-landscape-heygen',
  'avatar-ugc-heygen',
] as const;
