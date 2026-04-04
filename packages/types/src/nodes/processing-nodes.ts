// =============================================================================
// PROCESSING NODE DATA
// =============================================================================

import type {
  GridPosition,
  LumaAspectRatio,
  LumaReframeModel,
  TopazUpscaleFactor,
  TopazVideoFPS,
  TopazVideoResolution,
} from './ai-nodes';
import type { BaseNodeData } from './base';

export type EasingPreset =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo';

export type CubicBezier = [number, number, number, number];

export interface AnimationNodeData extends BaseNodeData {
  // Inputs from connections
  inputVideo: string | null;

  // Output
  outputVideo: string | null;

  // Easing config
  curveType: 'preset' | 'custom';
  preset: EasingPreset;
  customCurve: CubicBezier;

  // Time-warp settings
  speedMultiplier: number;
}

export type TransitionType = 'cut' | 'crossfade' | 'wipe' | 'fade';

// Audio codec options for social media compatibility
// AAC: Best compatibility (Twitter, Instagram, TikTok)
// MP3: Fallback for older players
export type AudioCodec = 'aac' | 'mp3';

// Output quality presets
// full: Original quality, slower encoding
// draft: 720p @ 4Mbps, faster preview (inspired by easy-peasy-ease)
export type OutputQuality = 'full' | 'draft';

export interface VideoStitchNodeData extends BaseNodeData {
  // Inputs from connections
  inputVideos: string[];

  // Output
  outputVideo: string | null;

  // Stitch config
  transitionType: TransitionType;
  transitionDuration: number;
  seamlessLoop: boolean;

  // Audio/quality settings (easy-peasy-ease inspired)
  audioCodec: AudioCodec;
  outputQuality: OutputQuality;
}

export interface ResizeNodeData extends BaseNodeData {
  // Inputs from connections
  inputMedia: string | null;
  inputType: 'image' | 'video' | null;

  // Output
  outputMedia: string | null;

  // Resize config (uses Luma models)
  targetAspectRatio: LumaAspectRatio;
  prompt: string;
  gridPosition: GridPosition;

  // Job state
  jobId: string | null;
}

export interface VideoTrimNodeData extends BaseNodeData {
  // Inputs from connections
  inputVideo: string | null;

  // Output
  outputVideo: string | null;

  // Trim config (in seconds)
  startTime: number;
  endTime: number;
  duration: number | null;

  // Job state
  jobId: string | null;
}

// Frame selection mode for video frame extraction
export type FrameSelectionMode = 'first' | 'last' | 'timestamp' | 'percentage';

export interface VideoFrameExtractNodeData extends BaseNodeData {
  // Input from connection
  inputVideo: string | null;

  // Output
  outputImage: string | null;

  // Config
  selectionMode: FrameSelectionMode;
  timestampSeconds: number;
  percentagePosition: number;

  // Video metadata (populated from input)
  videoDuration: number | null;

  // Job state
  jobId: string | null;
}

// =============================================================================
// REFRAME NODE DATA
// =============================================================================

export type ReframeInputType = 'image' | 'video' | null;

export interface ReframeNodeData extends BaseNodeData {
  // Inputs from connections (accepts either image or video)
  inputImage: string | null;
  inputVideo: string | null;
  inputType: ReframeInputType; // Auto-detected from connection

  // Outputs (matches input type)
  outputImage: string | null;
  outputVideo: string | null;

  // Config
  model: LumaReframeModel; // Model selection dropdown
  aspectRatio: LumaAspectRatio;
  prompt: string;
  gridPosition: GridPosition;

  // Job state
  jobId: string | null;
}

// =============================================================================
// UPSCALE NODE DATA
// =============================================================================

export type UpscaleInputType = 'image' | 'video' | null;

// Available upscale models
export type UpscaleModel =
  | 'topaz-standard-v2'
  | 'topaz-low-res-v2'
  | 'topaz-cgi'
  | 'topaz-high-fidelity-v2'
  | 'topaz-text-refine'
  | 'topaz-video';

export interface UpscaleNodeData extends BaseNodeData {
  // Inputs from connections (accepts either image or video)
  inputImage: string | null;
  inputVideo: string | null;
  inputType: UpscaleInputType; // Auto-detected from connection

  // Outputs (matches input type)
  outputImage: string | null;
  outputVideo: string | null;
  originalPreview: string | null;
  outputPreview: string | null; // For video frame comparison

  // Shared config
  model: UpscaleModel; // Model selection dropdown

  // Image-specific config
  upscaleFactor: TopazUpscaleFactor;
  outputFormat: 'jpg' | 'png';
  faceEnhancement: boolean;
  faceEnhancementStrength: number;
  faceEnhancementCreativity: number;

  // Video-specific config
  targetResolution: TopazVideoResolution;
  targetFps: TopazVideoFPS;

  // Comparison state
  showComparison: boolean;
  comparisonPosition: number;

  // Job state
  jobId: string | null;
}

export type GridOutputFormat = 'jpg' | 'png' | 'webp';

export interface ImageGridSplitNodeData extends BaseNodeData {
  // Input from connection
  inputImage: string | null;

  // Outputs (multiple images)
  outputImages: string[];

  // Config
  gridRows: number; // 1-10
  gridCols: number; // 1-10
  borderInset: number; // Pixels to crop from each cell edge (0-50)
  outputFormat: GridOutputFormat;
  quality: number; // 1-100
}

// Annotation shape types (simplified for node storage)
export interface AnnotationShapeData {
  id: string;
  type: 'rectangle' | 'circle' | 'arrow' | 'freehand' | 'text';
  strokeColor: string;
  strokeWidth: number;
  fillColor: string | null;
  // Shape-specific properties stored as generic record
  props: Record<string, unknown>;
}

export interface AnnotationNodeData extends BaseNodeData {
  // Input from connection
  inputImage: string | null;

  // Output (image with annotations rendered)
  outputImage: string | null;

  // Annotations stored on the node
  annotations: AnnotationShapeData[];
  hasAnnotations: boolean;
}

export type SubtitleStyle = 'default' | 'modern' | 'minimal' | 'bold';
export type SubtitlePosition = 'top' | 'center' | 'bottom';

export interface SubtitleNodeData extends BaseNodeData {
  // Inputs from connections
  inputVideo: string | null;
  inputText: string | null;

  // Output
  outputVideo: string | null;

  // Config
  style: SubtitleStyle;
  position: SubtitlePosition;
  fontSize: number;
  fontColor: string;
  backgroundColor: string | null;
  fontFamily: string;

  // Job state
  jobId: string | null;
}

// =============================================================================
// OUTPUT NODE DATA
// =============================================================================

export interface OutputGalleryNodeData extends BaseNodeData {
  images: string[];
}

export interface ImageCompareNodeData extends BaseNodeData {
  imageA: string | null;
  imageB: string | null;
}

export type OutputInputType = 'image' | 'video' | null;

export interface DownloadNodeData extends BaseNodeData {
  // Inputs from connections (accepts either image or video)
  inputImage: string | null;
  inputVideo: string | null;
  inputType: OutputInputType; // Auto-detected from connection

  // Output name for saving
  outputName: string;
}

/** @deprecated Use DownloadNodeData instead */
export type OutputNodeData = DownloadNodeData;
