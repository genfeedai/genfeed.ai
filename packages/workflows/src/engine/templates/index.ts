import { CLIP_CHAIN_VIDEO_TEMPLATE } from './clip-chain-video.template';
import type { WorkflowTemplate } from './workflow-template';

export type {
  ClipChainTemplateMetadata,
  ClipChainTemplateParams,
  ClipChainWorkflowInstance,
  ClipChainWorkflowTemplate,
  VideoExtensionTemplateParams,
} from './clip-chain-video.template';
export {
  buildClipChainVideoTemplate,
  buildVideoExtensionTemplate,
  CLIP_CHAIN_VIDEO_TEMPLATE,
  CLIP_CHAIN_VIDEO_TEMPLATE_ID,
  composeClipChainSegmentPrompt,
  createClipChainWorkflowInstance,
  DEFAULT_CLIP_CHAIN_SEGMENT_COUNT,
  estimateClipChainCredits,
} from './clip-chain-video.template';
export type { WorkflowTemplate } from './workflow-template';

export function getAvailableTemplates(): WorkflowTemplate[] {
  return [CLIP_CHAIN_VIDEO_TEMPLATE];
}

export function getTemplateById(id: string): WorkflowTemplate | null {
  return getAvailableTemplates().find((template) => template.id === id) ?? null;
}
