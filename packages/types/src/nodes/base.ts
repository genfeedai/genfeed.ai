// =============================================================================
// NODE TYPES & BASE NODE DATA
// =============================================================================

export enum NodeTypeEnum {
  // Input nodes
  IMAGE_INPUT = 'imageInput',
  AUDIO_INPUT = 'audioInput',
  VIDEO_INPUT = 'videoInput',
  PROMPT = 'prompt',
  PROMPT_CONSTRUCTOR = 'promptConstructor',
  // AI generation nodes
  IMAGE_GEN = 'imageGen',
  VIDEO_GEN = 'videoGen',
  LLM = 'llm',
  LIP_SYNC = 'lipSync',
  VOICE_CHANGE = 'voiceChange',
  TEXT_TO_SPEECH = 'textToSpeech',
  TRANSCRIBE = 'transcribe',
  MOTION_CONTROL = 'motionControl',
  // Processing nodes
  RESIZE = 'resize',
  ANIMATION = 'animation',
  VIDEO_STITCH = 'videoStitch',
  VIDEO_TRIM = 'videoTrim',
  VIDEO_FRAME_EXTRACT = 'videoFrameExtract',
  REFRAME = 'reframe',
  UPSCALE = 'upscale',
  IMAGE_GRID_SPLIT = 'imageGridSplit',
  ANNOTATION = 'annotation',
  SUBTITLE = 'subtitle',
  OUTPUT_GALLERY = 'outputGallery',
  IMAGE_COMPARE = 'imageCompare',
  // Output nodes
  DOWNLOAD = 'download',
  // Composition nodes (workflow-as-node)
  WORKFLOW_INPUT = 'workflowInput',
  WORKFLOW_OUTPUT = 'workflowOutput',
  WORKFLOW_REF = 'workflowRef',
}

export type NodeType = `${NodeTypeEnum}`;

export enum NodeCategoryEnum {
  INPUT = 'input',
  AI = 'ai',
  PROCESSING = 'processing',
  OUTPUT = 'output',
  COMPOSITION = 'composition',
}

export type NodeCategory = `${NodeCategoryEnum}`;

export enum NodeStatusEnum {
  IDLE = 'idle',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  ERROR = 'error',
}

export type NodeStatus = `${NodeStatusEnum}`;

export interface BaseNodeData extends Record<string, unknown> {
  label: string;
  status: NodeStatus;
  error?: string;
  progress?: number;
  // Lock state for skipping during execution
  isLocked?: boolean;
  cachedOutput?: unknown;
  lockTimestamp?: number;
  // Optional comment/note for the node (used for comment navigation)
  comment?: string;
  // Optional custom color for the node (hex color string)
  color?: string;
}
