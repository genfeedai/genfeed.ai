import {
  CINEMATIC_VIDEO_TEMPLATE,
  type WorkflowTemplate,
} from './cinematic-video.template';
import { CLIP_CHAIN_VIDEO_TEMPLATE } from './clip-chain-video.template';

export type { WorkflowTemplate } from './cinematic-video.template';
export {
  CINEMATIC_VIDEO_TEMPLATE,
  createCinematicWorkflowInstance,
} from './cinematic-video.template';
export type {
  ClipChainTemplateMetadata,
  ClipChainTemplateParams,
  ClipChainWorkflowInstance,
  ClipChainWorkflowTemplate,
} from './clip-chain-video.template';
export {
  buildClipChainVideoTemplate,
  CLIP_CHAIN_VIDEO_TEMPLATE,
  CLIP_CHAIN_VIDEO_TEMPLATE_ID,
  composeClipChainSegmentPrompt,
  createClipChainWorkflowInstance,
  DEFAULT_CLIP_CHAIN_SEGMENT_COUNT,
  estimateClipChainCredits,
} from './clip-chain-video.template';

export function getAvailableTemplates(): WorkflowTemplate[] {
  return [CINEMATIC_VIDEO_TEMPLATE, CLIP_CHAIN_VIDEO_TEMPLATE];
}

export function getTemplateById(id: string): WorkflowTemplate | null {
  return getAvailableTemplates().find((template) => template.id === id) ?? null;
}
