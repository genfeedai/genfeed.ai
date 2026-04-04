export type StudioMediaType = 'image' | 'video';

export interface StudioPreset {
  aspectRatio: string;
  id: string;
  label: string;
  mediaType: StudioMediaType;
}

export interface StudioGenerationRequest {
  aspectRatio: string;
  count: number;
  duration?: number;
  mediaType: StudioMediaType;
  model: string;
  prompt: string;
}

export interface StudioGenerationResult {
  mediaType: StudioMediaType;
  mimeType: string;
  name: string;
  path: string;
  sourceUrl: string;
}
