export * from './ai';
export { BaseNode } from './BaseNode';
export * from './composition';
export * from './input';
export { NodeDetailModal } from './NodeDetailModal';
export * from './output';
export * from './processing';

// Node type mapping for React Flow
import type { NodeTypes } from '@xyflow/react';
import {
  ImageGenNode,
  LipSyncNode,
  LLMNode,
  MotionControlNode,
  TextToSpeechNode,
  TranscribeNode,
  VideoGenNode,
  VoiceChangeNode,
} from './ai';
import {
  WorkflowInputNode,
  WorkflowOutputNode,
  WorkflowRefNode,
} from './composition';
import {
  AudioInputNode,
  ImageInputNode,
  PromptConstructorNode,
  PromptNode,
  VideoInputNode,
} from './input';
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
  VideoStitchNode,
  VideoTrimNode,
} from './processing';

export const nodeTypes: NodeTypes = {
  animation: AnimationNode,
  annotation: AnnotationNode,
  // Input nodes
  audioInput: AudioInputNode,
  // Output nodes
  download: DownloadNode,
  imageCompare: ImageCompareNode,
  // AI nodes
  imageGen: ImageGenNode,
  imageGridSplit: ImageGridSplitNode,
  imageInput: ImageInputNode,
  lipSync: LipSyncNode,
  llm: LLMNode,
  motionControl: MotionControlNode,
  outputGallery: OutputGalleryNode,
  prompt: PromptNode,
  promptConstructor: PromptConstructorNode,
  reframe: ReframeNode,
  // Processing nodes
  resize: ResizeNode,
  subtitle: SubtitleNode,
  textToSpeech: TextToSpeechNode,
  transcribe: TranscribeNode,
  upscale: UpscaleNode,
  videoFrameExtract: VideoFrameExtractNode,
  videoGen: VideoGenNode,
  videoInput: VideoInputNode,
  videoStitch: VideoStitchNode,
  videoTrim: VideoTrimNode,
  voiceChange: VoiceChangeNode,
  // Composition nodes (workflow-as-node)
  workflowInput: WorkflowInputNode,
  workflowOutput: WorkflowOutputNode,
  workflowRef: WorkflowRefNode,
};
