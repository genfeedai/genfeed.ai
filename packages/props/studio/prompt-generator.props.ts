import type { ReactNode } from 'react';

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

export interface PromptGeneratorInputProps {
  mode: PromptGeneratorMode;
  onModeChange: (mode: PromptGeneratorMode) => void;
  inputText: string;
  onInputChange: (text: string) => void;
  promptCount: number;
  onCountChange: (count: number) => void;
  targetMedia: PromptGeneratorMedia;
  onTargetMediaChange: (target: PromptGeneratorMedia) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  styleHint?: string;
  onStyleHintChange?: (hint: string) => void;
}

export interface GeneratedPromptCardProps {
  prompt: GeneratedPrompt;
  targetMedia: PromptGeneratorMedia;
  onQuickGenerate: (prompt: GeneratedPrompt, type: 'image' | 'video') => void;
  onCustomize: (prompt: GeneratedPrompt, type: 'image' | 'video') => void;
  onReject: (promptId: string) => void;
  isGenerating?: boolean;
  generatingType?: 'image' | 'video' | null;
}

export interface PromptGeneratorPageState {
  mode: PromptGeneratorMode;
  inputText: string;
  promptCount: number;
  targetMedia: PromptGeneratorMedia;
  styleHint: string;
  generatedPrompts: GeneratedPrompt[];
  isGenerating: boolean;
  generatingPromptId: string | null;
  generatingType: 'image' | 'video' | null;
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

export interface PromptMetadataTagProps {
  icon: ReactNode;
  label: string;
}
