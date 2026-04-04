/**
 * Extended Workflow Nodes for Genfeed Cloud
 *
 * These nodes extend the core OSS nodes with premium features:
 * - Distribution: Platform export, caption generation, publishing
 * - Automation: Webhook triggers, scheduling
 * - Repurposing: AI clip selection, platform multiplier
 * - SaaS: Brand management, AI persona content
 */

// Automation nodes
export * from '@workflow-cloud/nodes/automation';
// Distribution nodes
export * from '@workflow-cloud/nodes/distribution';
// Effects nodes
export * from '@workflow-cloud/nodes/effects';
// Repurposing nodes
export * from '@workflow-cloud/nodes/repurposing';
// SaaS nodes
export * from '@workflow-cloud/nodes/saas';
// Types
export * from '@workflow-cloud/nodes/types';
export { extendedNodeDefinitions, saasNodeDefinitions } from './definitions';

// SaaS node definitions from workflow-saas registry
import { ReviewGateNode } from '@workflow-cloud/nodes/automation/ReviewGateNode';
import { WebhookTriggerNode } from '@workflow-cloud/nodes/automation/WebhookTriggerNode';
import { CaptionGenNode } from '@workflow-cloud/nodes/distribution/CaptionGenNode';
import { PlatformExportNode } from '@workflow-cloud/nodes/distribution/PlatformExportNode';
// Node type mapping for extended nodes
import { EffectColorGradeNode } from '@workflow-cloud/nodes/effects/EffectColorGradeNode';
import { ClipSelectorNode } from '@workflow-cloud/nodes/repurposing/ClipSelectorNode';
import { PlatformMultiplierNode } from '@workflow-cloud/nodes/repurposing/PlatformMultiplierNode';

/**
 * Extended node types for React Flow
 * Merge with core nodeTypes when setting up the workflow canvas
 */
export const extendedNodeTypes = {
  captionGen: CaptionGenNode,
  // Repurposing
  clipSelector: ClipSelectorNode,
  // Effects
  colorGrade: EffectColorGradeNode,
  // Distribution
  platformExport: PlatformExportNode,
  platformMultiplier: PlatformMultiplierNode,
  reviewGate: ReviewGateNode,
  // Automation
  webhookTrigger: WebhookTriggerNode,
};

/**
 * Extended node categories
 */
export const extendedNodeCategories = {
  automation: {
    color: 'green',
    description: 'Triggers, scheduling, and workflow automation',
    label: 'Automation',
  },
  distribution: {
    color: 'blue',
    description: 'Export and publish content to social platforms',
    label: 'Distribution',
  },
  effects: {
    color: 'purple',
    description: 'Color grading, filters, and visual effects',
    label: 'Effects',
  },
  repurposing: {
    color: 'orange',
    description: 'Convert long-form content into short-form',
    label: 'Repurposing',
  },
  saas: {
    color: 'cyan',
    description: 'Brand management and AI persona nodes',
    label: 'SaaS',
  },
};
