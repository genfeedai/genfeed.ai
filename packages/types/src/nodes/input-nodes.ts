// =============================================================================
// INPUT NODE DATA
// =============================================================================

import type { BaseNodeData } from './base';

export interface ImageInputNodeData extends BaseNodeData {
  image: string | null;
  filename: string | null;
  dimensions: { width: number; height: number } | null;
  source: 'upload' | 'url';
  url?: string;
}

export interface PromptNodeData extends BaseNodeData {
  prompt: string;
  variables: Record<string, string>;
}

export interface AudioInputNodeData extends BaseNodeData {
  audio: string | null;
  filename: string | null;
  duration: number | null;
  source: 'upload' | 'url';
  url?: string;
}

export interface VideoInputNodeData extends BaseNodeData {
  video: string | null;
  filename: string | null;
  duration: number | null;
  dimensions: { width: number; height: number } | null;
  source: 'upload' | 'url';
  url?: string;
}

export interface AvailableVariable {
  name: string;
  value: string;
  nodeId: string;
}

export type PromptFormat = 'text' | 'json';

export type PromptJsonValue =
  | string
  | number
  | boolean
  | null
  | PromptJsonValue[]
  | { [key: string]: PromptJsonValue };

export interface PromptConstructorNodeData extends BaseNodeData {
  template: string;
  outputText: string | null;
  unresolvedVars: string[];
  /** Authoring/output mode. Defaults to text when omitted. */
  promptFormat?: PromptFormat;
  /**
   * Parsed JSON object when `promptFormat` is json and the template is valid.
   * Invalid JSON is kept as draft `template` text with this field cleared.
   */
  structuredPrompt?: PromptJsonValue | null;
}

export const CAST_PROMPT_FAMILIES = ['ugc', 'cinematic'] as const;

export type CastPromptFamily = (typeof CAST_PROMPT_FAMILIES)[number];

export const CAST_CAMERA_MOVEMENTS = [
  'dolly',
  'tracking',
  'static',
  'crane',
  'aerial',
  'handheld',
  'steadicam',
] as const;

export type CastCameraMovement = (typeof CAST_CAMERA_MOVEMENTS)[number];

export interface CastPromptNodeData extends BaseNodeData {
  action: string;
  cameraMovement: CastCameraMovement;
  colorPalette: string;
  family: CastPromptFamily;
  hasStartFrameReference: boolean;
  lighting: string;
  mood: string;
  outputPrompt: string | null;
  presetId: string;
  subject: string;
}
