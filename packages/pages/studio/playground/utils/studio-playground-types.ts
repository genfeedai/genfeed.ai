import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import {
  isFlux3ImageModel,
  resolveMusicSettings,
} from '@genfeedai/contracts/constants';
import type {
  StudioPlaygroundCapabilities,
  StudioPlaygroundType,
  StudioPlaygroundTypeConfig,
} from '../types';

/**
 * Registry order is the order the composer's type dropdown renders.
 * `image` is first because it is the default and by far the hottest path.
 */
export const STUDIO_PLAYGROUND_TYPES = [
  'image',
  'image-edit',
  'video',
  'music',
  'avatar',
  'voice',
] as const satisfies readonly StudioPlaygroundType[];

export const DEFAULT_STUDIO_PLAYGROUND_TYPE: StudioPlaygroundType = 'image';

const STUDIO_PLAYGROUND_TYPE_CONFIGS: Record<
  StudioPlaygroundType,
  StudioPlaygroundTypeConfig
> = {
  avatar: {
    capabilities: {
      hasAspectRatio: false,
      // `POST /videos/avatar` takes a photo, a script, and a voice — no brand
      // enrichment fields, so the Brand switch would be a lie here.
      hasBrandEnrichment: false,
      hasDuration: false,
      hasIdentity: true,
      hasInstrumentalToggle: false,
      hasLook: false,
      hasLyrics: false,
      // Avatar clips go to HeyGen directly — there is no router model catalog.
      hasModelSelection: false,
      hasOutputs: false,
      hasReferences: false,
      hasSpeech: true,
      hasStyle: false,
    },
    elementsType: 'all',
    ingredientCategory: IngredientCategory.AVATAR,
    label: 'Avatar',
    modelCategory: null,
    // An avatar clip is persisted as a *video* ingredient — the backend
    // publishes `WebSocketPaths.video(id)` and stores it in `/videos`. The
    // `/avatars` collection holds the source portraits, which are inputs.
    resourceSegment: 'videos',
    type: 'avatar',
  },
  image: {
    capabilities: {
      hasAspectRatio: true,
      hasBrandEnrichment: true,
      hasDuration: false,
      hasIdentity: false,
      hasInstrumentalToggle: false,
      hasLook: true,
      hasLyrics: false,
      hasModelSelection: true,
      hasOutputs: true,
      hasReferences: true,
      hasSpeech: false,
      hasStyle: false,
    },
    elementsType: 'image',
    ingredientCategory: IngredientCategory.IMAGE,
    label: 'Image',
    modelCategory: ModelCategory.IMAGE,
    resourceSegment: 'images',
    type: 'image',
  },
  'image-edit': {
    capabilities: {
      hasAspectRatio: false,
      hasBrandEnrichment: false,
      hasDuration: false,
      hasIdentity: false,
      hasInstrumentalToggle: false,
      hasLook: false,
      hasLyrics: false,
      hasModelSelection: true,
      hasOutputs: true,
      hasReferences: true,
      hasSpeech: false,
      hasStyle: false,
    },
    elementsType: 'image',
    ingredientCategory: IngredientCategory.IMAGE,
    label: 'Edit image',
    modelCategory: ModelCategory.IMAGE_EDIT,
    resourceSegment: 'images',
    type: 'image-edit',
  },
  music: {
    capabilities: {
      hasAspectRatio: false,
      // The music payload carries model, duration, instrumental, and lyrics.
      hasBrandEnrichment: false,
      hasDuration: true,
      hasIdentity: false,
      hasInstrumentalToggle: true,
      hasLook: false,
      hasLyrics: true,
      hasModelSelection: true,
      hasOutputs: true,
      hasReferences: false,
      hasSpeech: false,
      // Genre/style is folded into the prompt server-side, identically for
      // every music provider — no per-model narrowing needed (unlike
      // instrumental/lyrics).
      hasStyle: true,
    },
    elementsType: 'music',
    ingredientCategory: IngredientCategory.MUSIC,
    label: 'Music',
    modelCategory: ModelCategory.MUSIC,
    resourceSegment: 'musics',
    type: 'music',
  },
  video: {
    capabilities: {
      hasAspectRatio: true,
      hasBrandEnrichment: true,
      hasDuration: true,
      hasIdentity: false,
      hasInstrumentalToggle: false,
      hasLook: true,
      hasLyrics: false,
      hasModelSelection: true,
      // Video providers bill per clip — one clip per generate, no multiplier.
      hasOutputs: false,
      hasReferences: true,
      // A video prompt describes a scene. Spoken-script clips are the Avatar
      // type — nothing in the video payload carries a script.
      hasSpeech: false,
      hasStyle: false,
    },
    elementsType: 'video',
    ingredientCategory: IngredientCategory.VIDEO,
    label: 'Video',
    modelCategory: ModelCategory.VIDEO,
    resourceSegment: 'videos',
    type: 'video',
  },
  voice: {
    capabilities: {
      hasAspectRatio: false,
      // `POST /voices/generate` takes text + voice id, nothing brand-shaped.
      hasBrandEnrichment: false,
      hasDuration: false,
      hasIdentity: true,
      hasInstrumentalToggle: false,
      hasLook: false,
      hasLyrics: false,
      // The chosen catalog voice *is* the model — `/voices/generate` takes a
      // `voiceId`, never a router model key.
      hasModelSelection: false,
      hasOutputs: false,
      hasReferences: false,
      hasSpeech: true,
      hasStyle: false,
    },
    elementsType: 'voice',
    ingredientCategory: IngredientCategory.VOICE,
    label: 'Voice',
    modelCategory: null,
    resourceSegment: 'voices',
    type: 'voice',
  },
};

export function getStudioPlaygroundTypeConfig(
  type: StudioPlaygroundType,
): StudioPlaygroundTypeConfig {
  return STUDIO_PLAYGROUND_TYPE_CONFIGS[type];
}

/** Music controls require an explicit supported model; unresolved Auto stays closed. */
export function resolveStudioPlaygroundCapabilities(
  type: StudioPlaygroundType,
  modelKey: string | undefined,
): StudioPlaygroundCapabilities {
  const { capabilities } = getStudioPlaygroundTypeConfig(type);
  if (modelKey && isFlux3ImageModel(modelKey))
    return { ...capabilities, hasOutputs: false, hasAspectRatio: false };
  if (type !== 'music') return capabilities;
  const music = resolveMusicSettings(modelKey);
  return {
    ...capabilities,
    hasDuration: music.hasDurationEditing,
    hasInstrumentalToggle: music.hasInstrumentalToggle,
    hasLyrics: music.hasLyrics,
  };
}

export function listStudioPlaygroundTypeConfigs(): readonly StudioPlaygroundTypeConfig[] {
  return STUDIO_PLAYGROUND_TYPES.map(getStudioPlaygroundTypeConfig);
}

export function isStudioPlaygroundType(
  value: unknown,
): value is StudioPlaygroundType {
  return (
    typeof value === 'string' &&
    (STUDIO_PLAYGROUND_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Narrows persisted / restored values back onto the registry. Unknown input
 * falls back to `image` rather than throwing — this feeds UI state, not a query.
 */
export function resolveStudioPlaygroundType(
  value: unknown,
): StudioPlaygroundType {
  return isStudioPlaygroundType(value) ? value : DEFAULT_STUDIO_PLAYGROUND_TYPE;
}
