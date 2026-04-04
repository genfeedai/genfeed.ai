// =============================================================================
// PROVIDER TYPES
// =============================================================================

export enum ProviderTypeEnum {
  REPLICATE = 'replicate',
  FAL = 'fal',
  HUGGINGFACE = 'huggingface',
  GENFEED_AI = 'genfeed-ai',
}

export type ProviderType = `${ProviderTypeEnum}`;

export enum ModelCapabilityEnum {
  TEXT_TO_IMAGE = 'text-to-image',
  IMAGE_TO_IMAGE = 'image-to-image',
  TEXT_TO_VIDEO = 'text-to-video',
  IMAGE_TO_VIDEO = 'image-to-video',
  TEXT_GENERATION = 'text-generation',
}

export type ModelCapability = `${ModelCapabilityEnum}`;

export enum ModelUseCaseEnum {
  STYLE_TRANSFER = 'style-transfer',
  CHARACTER_CONSISTENT = 'character-consistent',
  IMAGE_VARIATION = 'image-variation',
  INPAINTING = 'inpainting',
  UPSCALE = 'upscale',
  GENERAL = 'general',
}

export type ModelUseCase = `${ModelUseCaseEnum}`;

export interface ProviderModel {
  id: string;
  displayName: string;
  provider: ProviderType;
  capabilities: ModelCapability[];
  description?: string;
  thumbnail?: string;
  pricing?: string;
  inputSchema?: Record<string, unknown>;
  /** Component schemas containing enum definitions (aspect_ratio, duration, etc.) */
  componentSchemas?: Record<string, unknown>;
  /** Use cases this model supports (style transfer, upscale, etc.) */
  useCases?: ModelUseCase[];
}

export interface SelectedModel {
  /** Alias for modelId - used by hooks that expect id */
  id?: string;
  provider: ProviderType;
  modelId: string;
  displayName: string;
  inputSchema?: Record<string, unknown>;
  /** Component schemas containing enum definitions (aspect_ratio, duration, etc.) */
  componentSchemas?: Record<string, unknown>;
}
