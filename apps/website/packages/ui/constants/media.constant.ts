import { IngredientCategory, ModelCategory, ModelKey } from '@genfeedai/enums';
import type { MediaConfig } from '@genfeedai/interfaces/ui/media-config.interface';
import { EnvironmentService } from '@services/core/environment.service';

export const MEDIA_TYPE_CONFIGS: Partial<
  Record<IngredientCategory, MediaConfig>
> = {
  [IngredientCategory.VIDEO]: {
    assetType: 'video',
    buttons: {
      blacklist: true,
      camera: true,
      fontFamily: false,
      format: true,
      gallery: true,
      model: true,
      mood: true,
      presets: true,
      reference: true,
      scene: true,
      sounds: true,
      style: true,
      tags: true,
      upload: true,
    },
    defaultModel: EnvironmentService.MODELS_DEFAULT
      .video as MediaConfig['defaultModel'],
    generateLabel: 'Generate Video',
    placeholder: 'What video should we create next?',
    presetType: ModelCategory.VIDEO,
  },
  [IngredientCategory.IMAGE]: {
    assetType: 'image',
    buttons: {
      blacklist: true,
      camera: false,
      fontFamily: false,
      format: true,
      gallery: true,
      model: true,
      mood: true,
      presets: true,
      reference: true,
      scene: true,
      sounds: false,
      style: true,
      tags: true,
      upload: true,
    },
    defaultModel: EnvironmentService.MODELS_DEFAULT
      .image as MediaConfig['defaultModel'],
    generateLabel: 'Generate Image',
    placeholder: 'Describe the image you want to create...',
    presetType: ModelCategory.IMAGE,
  },
  [IngredientCategory.MUSIC]: {
    assetType: 'music',
    buttons: {
      camera: false,
      fontFamily: false,
      format: false,
      model: true,
      mood: true,
      presets: true,
      reference: false,
      scene: false,
      style: true,
      tags: false,
    },
    defaultModel:
      ModelKey.REPLICATE_META_MUSICGEN as MediaConfig['defaultModel'],
    placeholder: 'Describe the music you want to create...',
    presetType: ModelCategory.MUSIC,
  },
  [IngredientCategory.TEXT]: {
    assetType: 'text',
    buttons: {
      blacklist: false,
      camera: false,
      fontFamily: false,
      format: false,
      gallery: false,
      model: false,
      mood: false,
      presets: false,
      reference: false,
      scene: false,
      sounds: false,
      style: false,
      tags: false,
      upload: false,
    },
    defaultModel:
      ModelKey.REPLICATE_GOOGLE_IMAGEN_3 as MediaConfig['defaultModel'],
    generateLabel: 'Generate Article',
    placeholder: 'What article topic should we explore?',
    presetType: ModelCategory.TEXT,
  },
};

const ROUTE_TO_CATEGORY: Record<string, IngredientCategory> = {
  '/avatars': IngredientCategory.IMAGE,
  '/lip-sync': IngredientCategory.VIDEO,
  '/multi-image-to-video': IngredientCategory.VIDEO,
  '/upscale': IngredientCategory.IMAGE,
};

const MEDIA_TYPE_TO_CATEGORY: Record<string, IngredientCategory> = {
  avatar: IngredientCategory.VIDEO,
  image: IngredientCategory.IMAGE,
  music: IngredientCategory.MUSIC,
  text: IngredientCategory.TEXT,
  video: IngredientCategory.VIDEO,
};

const ROUTE_OVERRIDES: Record<string, Partial<MediaConfig>> = {
  '/avatars': {
    buttons: {
      ...MEDIA_TYPE_CONFIGS[IngredientCategory.IMAGE]?.buttons,
      blacklist: false,
      format: false,
      gallery: false,
      reference: false,
      scene: false,
      tags: false,
      upload: false,
    },
    placeholder: 'Describe your avatar...',
  },
  '/lip-sync': {
    buttons: {
      ...MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO]?.buttons,
      blacklist: false,
      camera: false,
      gallery: false,
      mood: false,
      reference: false,
      scene: false,
      sounds: false,
      style: false,
      tags: false,
      upload: false,
    },
    placeholder: 'Enter the dialogue for lip-sync...',
  },
  '/multi-image-to-video': {
    buttons: {
      ...MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO]?.buttons,
      blacklist: false,
      gallery: false,
      reference: false,
      scene: false,
      sounds: false,
      tags: false,
      upload: false,
    },
    placeholder: 'Describe how to combine these images into a video...',
  },
  '/upscale': {
    buttons: {
      ...MEDIA_TYPE_CONFIGS[IngredientCategory.IMAGE]?.buttons,
      blacklist: false,
      format: false,
      gallery: false,
      mood: false,
      reference: false,
      scene: false,
      style: false,
      tags: false,
      upload: false,
    },
    placeholder: 'Describe enhancement preferences...',
  },
};

export function getConfigForRoute(pathname: string): MediaConfig {
  const category = getCategoryFromRoute(pathname);
  const baseConfig = getConfigForCategoryType(category);

  if (ROUTE_OVERRIDES[pathname]) {
    return { ...baseConfig, ...ROUTE_OVERRIDES[pathname] } as MediaConfig;
  }

  return baseConfig;
}

export function getCategoryFromRoute(pathname: string): IngredientCategory {
  if (pathname === '/studio') {
    return IngredientCategory.VIDEO;
  }

  if (pathname.startsWith('/studio/')) {
    const mediaType = pathname.split('/')[2] as string;
    return MEDIA_TYPE_TO_CATEGORY[mediaType] ?? IngredientCategory.VIDEO;
  }

  return ROUTE_TO_CATEGORY[pathname] ?? IngredientCategory.VIDEO;
}

export function getConfigForCategoryType(
  categoryType: IngredientCategory,
): MediaConfig {
  const config = MEDIA_TYPE_CONFIGS[categoryType];
  const fallback = MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO];
  return config ?? fallback ?? ({} as MediaConfig);
}
