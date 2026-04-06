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
export * from '@/features/workflows/nodes/automation';
// Distribution nodes
export * from '@/features/workflows/nodes/distribution';
// Effects nodes
export * from '@/features/workflows/nodes/effects';
// Repurposing nodes
export * from '@/features/workflows/nodes/repurposing';
// SaaS nodes
export * from '@/features/workflows/nodes/saas';
// Types
export * from '@/features/workflows/nodes/types';
export { extendedNodeDefinitions, saasNodeDefinitions } from './definitions';

// SaaS node definitions from workflow-saas registry
import { ReviewGateNode } from '@/features/workflows/nodes/automation/ReviewGateNode';
import { WebhookTriggerNode } from '@/features/workflows/nodes/automation/WebhookTriggerNode';
import { CaptionGenNode } from '@/features/workflows/nodes/distribution/CaptionGenNode';
import { PlatformExportNode } from '@/features/workflows/nodes/distribution/PlatformExportNode';
// Node type mapping for extended nodes
import { EffectColorGradeNode } from '@/features/workflows/nodes/effects/EffectColorGradeNode';
import { ClipSelectorNode } from '@/features/workflows/nodes/repurposing/ClipSelectorNode';
import { PlatformMultiplierNode } from '@/features/workflows/nodes/repurposing/PlatformMultiplierNode';

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
