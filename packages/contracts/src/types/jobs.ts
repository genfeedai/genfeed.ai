/**
 * Job data types for BullMQ queue processing.
 */

import type { KlingQuality, ReframeNodeType, UpscaleNodeType } from './enums';
import type { ModelInputSchema, NodeOutput, SchemaParams } from './execution';

export interface BaseJobData {
  executionId: string;
  workflowId: string;
  timestamp: string;
  /** Debug mode - skip API calls and return mock data */
  debugMode?: boolean;
}

export interface WorkflowJobData extends BaseJobData {
  /** Selected node IDs for partial execution (empty = execute all) */
  selectedNodeIds?: string[];
}

export interface NodeJobData extends BaseJobData {
  nodeId: string;
  nodeType: string;
  nodeData: Record<string, unknown>;
  dependsOn?: string[];
}

export interface SelectedModelInfo {
  provider: string;
  modelId: string;
  displayName?: string;
  inputSchema?: ModelInputSchema;
}

export interface ImageJobData extends NodeJobData {
  nodeType: 'imageGen';
  nodeData: {
    model: 'nano-banana' | 'nano-banana-pro';
    prompt?: string;
    inputPrompt?: string;
    inputImages?: string[];
    aspectRatio?: string;
    resolution?: string;
    outputFormat?: string;
    selectedModel?: SelectedModelInfo;
    schemaParams?: SchemaParams;
  };
}

export interface VideoJobData extends NodeJobData {
  nodeType: 'videoGen';
  nodeData: {
    model: 'veo-3.1-fast' | 'veo-3.1';
    prompt?: string;
    inputPrompt?: string;
    image?: string;
    inputImage?: string;
    lastFrame?: string;
    referenceImages?: string[];
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    generateAudio?: boolean;
    negativePrompt?: string;
    seed?: number;
    selectedModel?: SelectedModelInfo;
    schemaParams?: SchemaParams;
  };
}

export type LLMProvider = 'replicate' | 'ollama';

export interface LLMJobData extends NodeJobData {
  nodeType: 'llm';
  nodeData: {
    prompt?: string;
    inputPrompt?: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    provider?: LLMProvider;
    ollamaModel?: string;
    selectedModel?: SelectedModelInfo;
    schemaParams?: SchemaParams;
  };
}

export interface MotionControlJobData extends NodeJobData {
  nodeType: 'motionControl';
  nodeData: {
    image: string;
    inputImage?: string;
    video?: string;
    inputVideo?: string;
    prompt?: string;
    inputPrompt?: string;
    mode: 'trajectory' | 'camera' | 'combined' | 'video_transfer';
    duration: 5 | 10;
    aspectRatio: '16:9' | '9:16' | '1:1';
    trajectoryPoints?: Array<{ x: number; y: number; frame: number }>;
    cameraMovement?: string;
    cameraIntensity?: number;
    motionStrength?: number;
    negativePrompt?: string;
    seed?: number;
    keepOriginalSound?: boolean;
    characterOrientation?: 'from_image' | 'left' | 'right';
    qualityMode?: KlingQuality;
  };
}

export interface ReframeJobData extends NodeJobData {
  nodeType: ReframeNodeType;
  nodeData: {
    inputType: 'image' | 'video';
    image?: string;
    video?: string;
    aspectRatio: string;
    model?: 'photon-flash-1' | 'photon-1';
    prompt?: string;
    gridPosition?: { x: number; y: number };
  };
}

export interface UpscaleJobData extends NodeJobData {
  nodeType: UpscaleNodeType;
  nodeData: {
    inputType: 'image' | 'video';
    image?: string;
    video?: string;
    model: string;
    enhanceModel?: string;
    upscaleFactor?: string;
    outputFormat?: string;
    faceEnhancement?: boolean;
    faceEnhancementStrength?: number;
    faceEnhancementCreativity?: number;
    targetResolution?: string;
    targetFps?: number;
  };
}

export interface VideoFrameExtractJobData extends NodeJobData {
  nodeType: 'videoFrameExtract';
  nodeData: {
    video: string;
    selectionMode: 'first' | 'last' | 'timestamp' | 'percentage';
    timestampSeconds?: number;
    percentagePosition?: number;
  };
}

export interface LipSyncJobData extends NodeJobData {
  nodeType: 'lipSync';
  nodeData: {
    image?: string;
    video?: string;
    audio?: string;
    inputImage?: string;
    inputVideo?: string;
    inputAudio?: string;
    model: 'sync/lipsync-2' | 'sync/lipsync-2-pro' | 'pixverse/lipsync';
    syncMode?: 'loop' | 'bounce' | 'cut_off' | 'silence' | 'remap';
    temperature?: number;
    activeSpeaker?: boolean;
  };
}

export interface VoiceChangeJobData extends NodeJobData {
  nodeType: 'voiceChange';
  nodeData: {
    video: string;
    audio: string;
    preserveOriginalAudio?: boolean;
    audioMixLevel?: number;
  };
}

export interface TextToSpeechJobData extends NodeJobData {
  nodeType: 'textToSpeech';
  nodeData: {
    text?: string;
    inputText?: string;
    provider: 'elevenlabs' | 'openai';
    voice: string;
    stability?: number;
    similarityBoost?: number;
    speed?: number;
  };
}

export interface TranscribeJobData extends NodeJobData {
  nodeType: 'transcribe';
  nodeData: {
    video?: string;
    audio?: string;
    inputVideo?: string;
    inputAudio?: string;
    language: string;
    timestamps: boolean;
  };
}

export interface SubtitleJobData extends NodeJobData {
  nodeType: 'subtitle';
  nodeData: {
    video: string;
    text: string;
    style: 'default' | 'modern' | 'minimal' | 'bold';
    position: 'top' | 'center' | 'bottom';
    fontSize: number;
    fontColor: string;
    backgroundColor: string | null;
    fontFamily: string;
  };
}

export interface VideoStitchJobData extends NodeJobData {
  nodeType: 'videoStitch';
  nodeData: {
    inputVideos: string[];
    transitionType: 'cut' | 'crossfade' | 'wipe' | 'fade';
    transitionDuration: number;
    seamlessLoop: boolean;
    audioCodec: 'aac' | 'mp3';
    outputQuality: 'full' | 'draft';
  };
}

export interface WorkflowRefJobData extends NodeJobData {
  nodeType: 'workflowRef';
  nodeData: {
    referencedWorkflowId: string;
    inputMappings: Record<string, string | null>;
    cachedInterface: {
      inputs: Array<{
        nodeId: string;
        name: string;
        type: string;
        required: boolean;
      }>;
      outputs: Array<{ nodeId: string; name: string; type: string }>;
    };
  };
  parentExecutionId: string;
  parentNodeId: string;
  depth: number;
}

export type ProcessingJobData =
  | ReframeJobData
  | UpscaleJobData
  | VideoFrameExtractJobData
  | LipSyncJobData
  | VoiceChangeJobData
  | TextToSpeechJobData
  | TranscribeJobData
  | SubtitleJobData
  | VideoStitchJobData
  | WorkflowRefJobData;

export interface JobResult {
  success: boolean;
  output?: string | string[] | NodeOutput;
  error?: string;
  cost?: number;
  predictTime?: number;
  predictionId?: string;
}

export interface JobProgress {
  percent: number;
  message?: string;
  timestamp: string;
}

export interface DLQJobData {
  originalJobId: string;
  originalQueue: string;
  data: BaseJobData | NodeJobData;
  error: string;
  stack?: string;
  attemptsMade: number;
  failedAt: string;
}
