export type PromptGeneratorMode = 'idea' | 'variation';
export type PromptGeneratorMedia = 'image' | 'video';
export type PromptGeneratorFormat = 'portrait' | 'landscape' | 'square';

export interface GeneratedPrompt {
  id: string;
  text: string;
  format: PromptGeneratorFormat;
  style: string;
  mood: string;
  camera: string;
  cameraMovement?: string;
  lighting: string;
  isRejected?: boolean;
}

export interface GeneratePromptsRequest {
  input: string;
  mode: PromptGeneratorMode;
  targetMedia: PromptGeneratorMedia;
  count: number;
  styleHint?: string;
}

export interface GeneratePromptsResponse {
  prompts: GeneratedPrompt[];
}
