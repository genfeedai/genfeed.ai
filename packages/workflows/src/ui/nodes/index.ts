export * from './ai';
export { BaseNode } from './BaseNode';
export * from './composition';
export * from './input';
export { NodeDetailModal } from './NodeDetailModal';
export * from './output';
export * from './processing';
export * from './saas';

// Node type mapping for React Flow
import type { NodeTypes } from '@xyflow/react';
import {
  LipSyncNode,
  MotionControlNode,
  TextToSpeechNode,
  TranscribeNode,
  VoiceChangeNode,
} from './ai';
import {
  WorkflowInputNode,
  WorkflowOutputNode,
  WorkflowRefNode,
} from './composition';
import { AudioInputNode, CastPromptNode, PromptConstructorNode } from './input';
import { DownloadNode } from './output';
import {
  AnimationNode,
  AnnotationNode,
  ImageCompareNode,
  ImageGridSplitNode,
  OutputGalleryNode,
  ReframeNode,
  ResizeNode,
  SubtitleNode,
  UpscaleNode,
  VideoFrameExtractNode,
  VideoQaNode,
  VideoStitchNode,
  VideoTrimNode,
} from './processing';
import { workflowSaaSNodeTypes } from './saas';

export const nodeTypes: NodeTypes = {
  animation: AnimationNode,
  annotation: AnnotationNode,
  // Input nodes
  audioInput: AudioInputNode,
  // Output nodes
  download: DownloadNode,
  imageCompare: ImageCompareNode,
  // AI nodes
  imageGridSplit: ImageGridSplitNode,
  lipSync: LipSyncNode,
  motionControl: MotionControlNode,
  outputGallery: OutputGalleryNode,
  promptConstructor: PromptConstructorNode,
  castPrompt: CastPromptNode,
  'cast-prompt-generator': CastPromptNode,
  reframe: ReframeNode,
  // Processing nodes
  resize: ResizeNode,
  subtitle: SubtitleNode,
  textToSpeech: TextToSpeechNode,
  transcribe: TranscribeNode,
  upscale: UpscaleNode,
  videoFrameExtract: VideoFrameExtractNode,
  videoQa: VideoQaNode,
  videoStitch: VideoStitchNode,
  videoTrim: VideoTrimNode,
  voiceChange: VoiceChangeNode,
  // Composition nodes (workflow-as-node)
  workflowInput: WorkflowInputNode,
  workflowOutput: WorkflowOutputNode,
  workflowRef: WorkflowRefNode,
  ...workflowSaaSNodeTypes,
};
