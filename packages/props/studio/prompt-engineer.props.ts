import { MediaType } from '@genfeedai/enums';

export { MediaType };

export interface StudioTool {
  id: string;
  title: string;
  description: string;
  href: string;
}

export interface ClipReference {
  name: string;
  sizeInMB: number;
  origin: 'upload' | 'sample';
  label?: string;
}

export interface PromptEngineerOptions {
  desiredDuration: number;
  tone: string;
  style: string;
  notes: string;
  model: string;
}

export interface ShotTemplate {
  camera: string;
  movement: string;
  description: string;
  focus: string;
}

export interface PromptEngineerShot extends ShotTemplate {
  id: string;
  order: number;
  timecode: string;
}

export interface PromptEngineerAnalysis {
  referenceLabel: string;
  referenceName: string;
  referenceOrigin: 'upload' | 'sample';
  estimatedDurationSeconds: number;
  desiredDurationSeconds: number;
  pacing: 'Fast' | 'Moderate' | 'Deliberate';
  tone: string;
  style: string;
  lighting: string;
  environment: string;
  colorPalette: string[];
  paletteLabel: string;
  moodWords: string[];
  cameraDirectives: string[];
  timeline: PromptEngineerShot[];
  summary: string;
  guidance: string[];
  technicalNotes: string[];
  prompt: string;
  negativePrompt: string;
  soraSettings: {
    model: string;
    aspectRatio: string;
    fps: number;
    resolution: string;
    motion: 'High' | 'Medium' | 'Low';
    seed: number;
  };
  metadata: {
    sizeInMB: number;
    fileName: string;
  };
  confidence: number;
  motionIntensity: number;
  beatIntervalSeconds: number;
  keywords: string[];
}

export interface SampleClip {
  id: string;
  label: string;
  description: string;
  fileName: string;
  tone: string;
  style: string;
  notes: string;
  sizeInMB: number;
  recommendedDuration: number;
}

export interface UploadState {
  descriptor: ClipReference;
  file?: File;
}

export interface VideoAnalysisShot {
  id: string;
  label: string;
  start: number;
  end: number;
  camera: string;
  movement: string;
  focus: string;
  paletteHex: string;
  prompt: string;
}

export interface PaletteSwatch {
  hex: string;
  brightness: number;
  timecode: string;
}

export type Orientation = 'landscape' | 'portrait' | 'square';

export interface VideoAnalysisResult {
  fileName: string;
  sizeInMB: number;
  durationSeconds: number;
  width: number;
  height: number;
  resolution: string;
  aspectRatio: string;
  orientation: Orientation;
  frameRate: number;
  tone: string;
  style: string;
  lighting: string;
  environment: string;
  colorPalette: PaletteSwatch[];
  shots: VideoAnalysisShot[];
  cameraDirectives: string[];
  guidance: string[];
  prompt: string;
  negativePrompt: string;
  motionIntensity: number;
  confidence: number;
  beatIntervalSeconds: number;
  soraSettings: {
    model: string;
    aspectRatio: string;
    fps: number;
    resolution: string;
    motion: 'High' | 'Medium' | 'Low';
    seed: number;
  };
  keywords: string[];
}

export interface ImagePaletteSwatch {
  hex: string;
  brightness: number;
  percentage: number;
}

export interface ImageAnalysisResult {
  fileName: string;
  sizeInMB: number;
  width: number;
  height: number;
  resolution: string;
  aspectRatio: string;
  orientation: Orientation;
  tone: string;
  style: string;
  lighting: string;
  environment: string;
  colorPalette: ImagePaletteSwatch[];
  subject: string;
  composition: string;
  texture: string;
  mood: string;
  guidance: string[];
  prompt: string;
  negativePrompt: string;
  confidence: number;
  generationSettings: {
    model: string;
    aspectRatio: string;
    resolution: string;
    style: string;
  };
  keywords: string[];
}
