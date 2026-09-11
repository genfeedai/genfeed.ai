import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import type { StudioGenerateType, StudioGenerateTypeConfig } from '../types';

/**
 * Registry order is the order the composer's type dropdown renders.
 * `image` is first because it is the default and by far the hottest path.
 */
export const STUDIO_GENERATE_TYPES = [
  'image',
  'video',
  'music',
  'avatar',
  'voice',
] as const satisfies readonly StudioGenerateType[];

export const DEFAULT_STUDIO_GENERATE_TYPE: StudioGenerateType = 'image';

const STUDIO_GENERATE_TYPE_CONFIGS: Record<
  StudioGenerateType,
  StudioGenerateTypeConfig
> = {
  avatar: {
    capabilities: {
      hasAspectRatio: false,
      // `POST /videos/avatar` takes a photo, a script, and a voice — no brand
      // enrichment fields, so the Brand switch would be a lie here.
      hasBrandEnrichment: false,
      hasDuration: false,
      hasIdentity: true,
      hasLook: false,
      // Avatar clips go to HeyGen directly — there is no router model catalog.
      hasModelSelection: false,
      hasOutputs: false,
      hasReferences: false,
      hasSpeech: true,
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
      hasLook: true,
      hasModelSelection: true,
      hasOutputs: true,
      hasReferences: true,
      hasSpeech: false,
    },
    elementsType: 'image',
    ingredientCategory: IngredientCategory.IMAGE,
    label: 'Image',
    modelCategory: ModelCategory.IMAGE,
    resourceSegment: 'images',
    type: 'image',
  },
  music: {
    capabilities: {
      hasAspectRatio: false,
      // The music payload carries model + duration only.
      hasBrandEnrichment: false,
      hasDuration: true,
      hasIdentity: false,
      hasLook: false,
      hasModelSelection: true,
      hasOutputs: true,
      hasReferences: false,
      hasSpeech: false,
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
      hasLook: true,
      hasModelSelection: true,
      // Video providers bill per clip — one clip per generate, no multiplier.
      hasOutputs: false,
      hasReferences: true,
      // A video prompt describes a scene. Spoken-script clips are the Avatar
      // type — nothing in the video payload carries a script.
      hasSpeech: false,
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
      hasLook: false,
      // The chosen catalog voice *is* the model — `/voices/generate` takes a
      // `voiceId`, never a router model key.
      hasModelSelection: false,
      hasOutputs: false,
      hasReferences: false,
      hasSpeech: true,
    },
    elementsType: 'voice',
    ingredientCategory: IngredientCategory.VOICE,
    label: 'Voice',
    modelCategory: null,
    resourceSegment: 'voices',
    type: 'voice',
  },
};

export function getStudioGenerateTypeConfig(
  type: StudioGenerateType,
): StudioGenerateTypeConfig {
  return STUDIO_GENERATE_TYPE_CONFIGS[type];
}

export function listStudioGenerateTypeConfigs(): readonly StudioGenerateTypeConfig[] {
  return STUDIO_GENERATE_TYPES.map(getStudioGenerateTypeConfig);
}

export function isStudioGenerateType(
  value: unknown,
): value is StudioGenerateType {
  return (
    typeof value === 'string' &&
    (STUDIO_GENERATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Narrows persisted / restored values back onto the registry. Unknown input
 * falls back to `image` rather than throwing — this feeds UI state, not a query.
 */
export function resolveStudioGenerateType(value: unknown): StudioGenerateType {
  return isStudioGenerateType(value) ? value : DEFAULT_STUDIO_GENERATE_TYPE;
}
