// =============================================================================
// PROMPT LIBRARY TYPES
// =============================================================================

// Style settings for image generation
export interface IStyleSettings {
  mood?: string;
  style?: string;
  camera?: string;
  lighting?: string;
  scene?: string;
}

// Category values for organizing prompts
export const PROMPT_CATEGORIES = [
  'ads',
  'anime',
  'product',
  'portrait',
  'landscape',
  'abstract',
  'fashion',
  'food',
  'architecture',
  'custom',
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

// Main prompt interface
export interface IPrompt {
  _id: string;
  name: string;
  description: string;
  promptText: string;
  styleSettings: IStyleSettings;
  aspectRatio?: string;
  preferredModel?: string;
  category: PromptCategory;
  tags: string[];
  thumbnail?: string;
  useCount: number;
  isFeatured: boolean;
  isSystem: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// Create/Update DTO type (frontend)
export interface ICreatePrompt {
  name: string;
  description?: string;
  promptText: string;
  styleSettings?: IStyleSettings;
  aspectRatio?: string;
  preferredModel?: string;
  category?: PromptCategory;
  tags?: string[];
  thumbnail?: string;
  isFeatured?: boolean;
}

// Query params type (frontend)
export interface IQueryPrompts {
  category?: PromptCategory;
  search?: string;
  tag?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'useCount' | 'name';
  sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// STYLE PRESETS
// =============================================================================

export const MOOD_PRESETS = [
  'cinematic',
  'dreamy',
  'gritty',
  'ethereal',
  'nostalgic',
  'futuristic',
  'mysterious',
  'peaceful',
  'energetic',
  'moody',
  'dramatic',
  'whimsical',
] as const;

export const STYLE_PRESETS = [
  'photorealistic',
  'anime',
  '3d-render',
  'oil-painting',
  'watercolor',
  'digital-art',
  'comic-book',
  'sketch',
  'pixel-art',
  'minimalist',
  'cyberpunk',
  'fantasy',
  'retro',
  'vintage',
] as const;

export const CAMERA_PRESETS = [
  'wide-angle',
  'macro',
  'telephoto',
  'drone',
  'portrait',
  'fisheye',
  'tilt-shift',
  'gopro',
  'close-up',
  'establishing',
  'eye-level',
  'low-angle',
  'high-angle',
  'dutch-angle',
] as const;

export const LIGHTING_PRESETS = [
  'golden-hour',
  'studio',
  'neon',
  'natural',
  'dramatic',
  'soft',
  'backlit',
  'rim-light',
  'high-key',
  'low-key',
  'candlelight',
  'moonlight',
  'fluorescent',
  'cinematic',
] as const;

export const SCENE_PRESETS = [
  'indoor',
  'outdoor',
  'urban',
  'nature',
  'studio',
  'underwater',
  'space',
  'abstract',
  'industrial',
  'domestic',
  'beach',
  'forest',
  'city-skyline',
  'desert',
] as const;

// Type helpers for presets
export type MoodPreset = (typeof MOOD_PRESETS)[number];
export type StylePreset = (typeof STYLE_PRESETS)[number];
export type CameraPreset = (typeof CAMERA_PRESETS)[number];
export type LightingPreset = (typeof LIGHTING_PRESETS)[number];
export type ScenePreset = (typeof SCENE_PRESETS)[number];

// Category display names for UI
export const CATEGORY_LABELS: Record<PromptCategory, string> = {
  abstract: 'Abstract Art',
  ads: 'Ads & Marketing',
  anime: 'Anime & Manga',
  architecture: 'Architecture',
  custom: 'Custom',
  fashion: 'Fashion',
  food: 'Food & Culinary',
  landscape: 'Landscapes',
  portrait: 'Portraits',
  product: 'Product Photography',
};
