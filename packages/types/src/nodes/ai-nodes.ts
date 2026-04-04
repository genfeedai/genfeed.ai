// =============================================================================
// AI NODE DATA
// =============================================================================

import type { BaseNodeData } from './base';
import type { ProviderType, SelectedModel } from './providers';

export type ImageModel = 'nano-banana' | 'nano-banana-pro';
export type VideoModel = 'veo-3.1-fast' | 'veo-3.1';
export type AspectRatio =
  | '1:1'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '4:5'
  | '5:4'
  | '2:3'
  | '3:2'
  | '21:9';
export type Resolution = '1K' | '2K' | '4K';
export type VideoResolution = '720p' | '1080p';
export type VideoDuration = 4 | 6 | 8;
export type OutputFormat = 'jpg' | 'png' | 'webp';

// Luma Reframe types
export type LumaAspectRatio =
  | '1:1'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '9:21'
  | '21:9';
export type LumaReframeModel = 'photon-flash-1' | 'photon-1';

export interface GridPosition {
  x: number;
  y: number;
}

// Topaz types
export type TopazEnhanceModel =
  | 'Standard V2'
  | 'Low Resolution V2'
  | 'CGI'
  | 'High Fidelity V2'
  | 'Text Refine';
export type TopazUpscaleFactor = 'None' | '2x' | '4x' | '6x';
export type TopazVideoResolution = '720p' | '1080p' | '4k';
export type TopazVideoFPS = 15 | 24 | 30 | 60;

export interface ImageGenNodeData extends BaseNodeData {
  // Inputs from connections
  inputImages: string[];
  inputPrompt: string | null;

  // Output (single image for backward compat)
  outputImage: string | null;

  // Output (multiple images - for models like SeedDream 4.5)
  outputImages: string[];

  // Model config
  model: ImageModel;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  outputFormat: OutputFormat;

  // Provider (optional, defaults to replicate)
  provider?: ProviderType;
  selectedModel?: SelectedModel;

  // Dynamic schema parameters (from model's inputSchema)
  schemaParams?: Record<string, unknown>;

  // Job state
  jobId: string | null;
}

export interface VideoGenNodeData extends BaseNodeData {
  // Inputs from connections
  inputImage: string | null;
  lastFrame: string | null;
  referenceImages: string[];
  inputPrompt: string | null;
  negativePrompt: string;

  // Output
  outputVideo: string | null;

  // Model config
  model: VideoModel;
  duration: VideoDuration;
  aspectRatio: AspectRatio;
  resolution: VideoResolution;
  generateAudio: boolean;

  // Provider (optional, defaults to replicate)
  provider?: ProviderType;
  selectedModel?: SelectedModel;

  // Dynamic schema parameters (from model's inputSchema)
  schemaParams?: Record<string, unknown>;

  // Job state
  jobId: string | null;
}

export type TextModel = 'meta-llama-3.1-405b-instruct' | 'claude-4.5-sonnet';

export interface LLMNodeData extends BaseNodeData {
  // Inputs from connections
  inputPrompt: string | null;

  // Output
  outputText: string | null;

  // Model config
  model: TextModel;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;

  // Provider (optional, defaults to replicate)
  provider?: ProviderType;
  selectedModel?: SelectedModel;

  // Dynamic schema parameters (from model's inputSchema)
  schemaParams?: Record<string, unknown>;

  // Job state
  jobId: string | null;
}

export type LipSyncModel =
  | 'sync/lipsync-2-pro'
  | 'sync/lipsync-2'
  | 'pixverse/lipsync'
  | 'bytedance/omni-human'
  | 'veed/fabric-1.0';

export type LipSyncMode = 'loop' | 'bounce' | 'cut_off' | 'silence' | 'remap';

export interface LipSyncNodeData extends BaseNodeData {
  // Inputs from connections
  inputImage: string | null;
  inputVideo: string | null;
  inputAudio: string | null;

  // Output
  outputVideo: string | null;

  // Config
  model: LipSyncModel;
  syncMode: LipSyncMode;
  temperature: number;
  activeSpeaker: boolean;

  // Job state
  jobId: string | null;
}

export interface VoiceChangeNodeData extends BaseNodeData {
  // Inputs from connections
  inputVideo: string | null;
  inputAudio: string | null;

  // Output
  outputVideo: string | null;

  // Config
  preserveOriginalAudio: boolean;
  audioMixLevel: number;

  // Job state
  jobId: string | null;
}

export type TTSProvider = 'elevenlabs' | 'openai';

export type TTSVoice =
  | 'rachel'
  | 'drew'
  | 'clyde'
  | 'paul'
  | 'domi'
  | 'dave'
  | 'fin'
  | 'sarah'
  | 'antoni'
  | 'thomas'
  | 'charlie'
  | 'george'
  | 'emily'
  | 'elli'
  | 'callum'
  | 'patrick'
  | 'harry'
  | 'liam'
  | 'dorothy'
  | 'josh'
  | 'arnold'
  | 'charlotte'
  | 'matilda'
  | 'matthew'
  | 'james'
  | 'joseph'
  | 'jeremy'
  | 'michael'
  | 'ethan'
  | 'gigi'
  | 'freya'
  | 'grace'
  | 'daniel'
  | 'lily'
  | 'serena'
  | 'adam'
  | 'nicole'
  | 'jessie'
  | 'ryan'
  | 'sam'
  | 'glinda'
  | 'giovanni'
  | 'mimi';

export interface TextToSpeechNodeData extends BaseNodeData {
  // Input from connection
  inputText: string | null;

  // Output
  outputAudio: string | null;

  // Config
  provider: TTSProvider;
  voice: TTSVoice;
  stability: number;
  similarityBoost: number;
  speed: number;

  // Job state
  jobId: string | null;
}

export type TranscribeLanguage =
  | 'auto'
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'ja'
  | 'zh'
  | 'ko'
  | 'pt';

export interface TranscribeNodeData extends BaseNodeData {
  // Inputs from connections
  inputVideo: string | null;
  inputAudio: string | null;

  // Output
  outputText: string | null;

  // Config
  language: TranscribeLanguage;
  timestamps: boolean;

  // Job state
  jobId: string | null;
}

// Kling Motion Control types
export type MotionControlMode =
  | 'trajectory'
  | 'camera'
  | 'combined'
  | 'video_transfer';
export type CameraMovement =
  | 'static'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'zoom_in'
  | 'zoom_out'
  | 'rotate_cw'
  | 'rotate_ccw'
  | 'dolly_in'
  | 'dolly_out';

// Re-export enum as type alias for backwards compat
export { KlingQuality } from '../enums';
export type KlingQualityMode = `${import('../enums').KlingQuality}`;

// Character orientation for video transfer
export type CharacterOrientation = 'image' | 'video';

export interface TrajectoryPoint {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  frame: number; // Frame number (0 to totalFrames)
}

export interface MotionControlNodeData extends BaseNodeData {
  // Inputs from connections
  inputImage: string | null;
  inputVideo: string | null;
  inputPrompt: string | null;

  // Output
  outputVideo: string | null;

  // Motion control config
  mode: MotionControlMode;
  duration: 5 | 10; // seconds
  aspectRatio: '16:9' | '9:16' | '1:1';

  // Trajectory mode (define motion path)
  trajectoryPoints: TrajectoryPoint[];

  // Camera mode
  cameraMovement: CameraMovement;
  cameraIntensity: number; // 0-100

  // Video transfer mode (Kling v2.6)
  qualityMode: KlingQualityMode;
  characterOrientation: CharacterOrientation;
  keepOriginalSound: boolean;

  // Advanced options
  motionStrength: number; // 0-100, how much motion to apply
  negativePrompt: string;
  seed: number | null;

  // Job state
  jobId: string | null;
}
