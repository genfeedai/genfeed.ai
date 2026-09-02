import type { ReactNode } from 'react';
import type {
  IngredientCategory,
  IngredientStatus,
  ModelCategory,
  RouterPriority,
} from '../..';
import type { IBaseEntity, IIngredient, IQueryParams } from '../index';

export type StudioLookAssetType = 'image' | 'video';

/**
 * Every field captured by a named, brand-shared Studio preset. Look fields are
 * required; the wider setup fields (model, output, brand) are optional so
 * pre-widening rows stay valid.
 */
export interface StudioLookPayload {
  aspectRatio?: string | null;
  brandingMode?: 'brand' | 'off' | null;
  camera: string;
  /** Present only for video Looks. Image Looks always persist this as null. */
  cameraMovement?: string | null;
  duration?: number | null;
  isPromptEnhanceEnabled?: boolean;
  lens: string;
  lighting: string;
  modelKey?: string | null;
  mood: string;
  outputs?: number | null;
  prioritize?: RouterPriority | null;
  promptTemplate: string;
  resolution?: string | null;
  scene: string;
  style: string;
}

export interface IStudioLook extends StudioLookPayload, IBaseEntity {
  assetType: StudioLookAssetType;
  brandId: string;
  label: string;
  organizationId: string;
  userId: string;
}

export interface FormDropdownOption {
  key: string | number;
  label: string;
  description?: string;
  thumbnailUrl?: string;
  badge?: string;
  badgeVariant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error';
  icon?: ReactNode;
  group?: string;
}

export interface AssetQueryService {
  findAll(query: IQueryParams): Promise<IIngredient[]>;
  findOne(id: string): Promise<IIngredient | null>;
}

export type BadgeVariant =
  | 'error'
  | 'info'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'success'
  | 'warning';

export interface AvatarVoiceOption extends FormDropdownOption {
  description: string;
  badge: string;
  badgeVariant?: BadgeVariant;
}

export interface AvatarVoiceData {
  avatars: IIngredient[];
  voices: IIngredient[];
}

export type ProviderVariant = 'secondary' | 'accent';

/**
 * Asset kinds the consolidated Studio playground can produce. Type is composer
 * state, never a URL segment — `/studio/generate` is the only route.
 */
export type StudioGenerateType =
  | 'image'
  | 'video'
  | 'music'
  | 'avatar'
  | 'voice';

/**
 * Which controls the settings popover and composer expose for a given type.
 * Keeps the UI declarative instead of branching on the type string in JSX.
 */
export interface StudioGenerateCapabilities {
  hasAspectRatio: boolean;
  /**
   * Whether the generation payload for this type actually carries the brand
   * enrichment fields. Only the router-backed image and video endpoints do —
   * music, avatar, and voice reach their providers without them, so the Brand
   * switch must not be offered there.
   */
  hasBrandEnrichment: boolean;
  hasDuration: boolean;
  hasIdentity: boolean;
  hasLook: boolean;
  hasModelSelection: boolean;
  hasOutputs: boolean;
  hasReferences: boolean;
  hasSpeech: boolean;
}

export interface StudioGenerateTypeConfig {
  capabilities: StudioGenerateCapabilities;
  /** `type` option passed to `useElements` so the gear only loads relevant elements. */
  elementsType: 'all' | 'image' | 'music' | 'video' | 'voice';
  ingredientCategory: IngredientCategory;
  label: string;
  /** `null` for types that have no router-backed model catalog (avatar, voice). */
  modelCategory: ModelCategory | null;
  /** Socket topic + REST collection segment, e.g. `images`. */
  resourceSegment: string;
  type: StudioGenerateType;
}

/**
 * Everything the gear popover owns. Persisted per type so switching Image →
 * Video → Image restores the operator's last setup.
 */
export interface StudioGenerateSettings {
  aspectRatio: string;
  /** Public URL of the chosen portrait, posted as `photoUrl`. */
  avatarPhotoUrl?: string;
  blacklist: string[];
  brandingMode: 'brand' | 'off';
  camera?: string;
  cameraMovement?: string;
  duration?: number;
  folder?: string;
  isAudioEnabled: boolean;
  lens?: string;
  lighting?: string;
  modelKey: string;
  mood?: string;
  outputs: number;
  prioritize: RouterPriority;
  /** Preset key — mapped to a `ContentTemplateKey` by the payload builder. */
  promptTemplate?: string;
  resolution: string;
  scene?: string;
  speech?: string;
  style?: string;
  tags: string[];
  voiceId?: string;
}

/**
 * Client-side snapshot of the prompt payload that actually left Studio after
 * `buildStudioPromptData`. Recipe display and Vary/Reprompt both read this so
 * the operator sees and edits the enriched request, not the raw composer box.
 */
export interface StudioGenerateRecipe {
  aspectRatio?: string;
  blacklist: string[];
  brandingMode: 'brand' | 'off';
  camera?: string;
  cameraMovement?: string;
  duration?: number;
  folder?: string;
  isAudioEnabled: boolean;
  lens?: string;
  lighting?: string;
  modelKey?: string;
  mood?: string;
  outputs: number;
  promptTemplate?: string;
  references: string[];
  resolution?: string;
  scene?: string;
  speech?: string;
  style?: string;
  tags: string[];
  text: string;
  type: StudioGenerateType;
}

export interface StudioGenerateJob {
  createdAt: number;
  error?: string;
  height?: number;
  id: string;
  /**
   * Full persisted asset behind a generated job. Ready image/video cards use
   * this to render the shared masonry behavior instead of a second, reduced
   * action system.
   */
  ingredient?: IIngredient;
  /**
   * Persisted ingredient identity, available before the full ingredient is
   * hydrated. Synthetic client-side failures deliberately omit it.
   */
  ingredientId?: string;
  modelKey?: string;
  prompt: string;
  /**
   * Enriched prompt payload stamped at submit. Survives session rehydrate so
   * the inspector can show what reached the provider, not the raw box.
   */
  recipe?: StudioGenerateRecipe;
  /**
   * Client-stamped id shared by every output of one submit. Absent on
   * gallery rows that were generated outside this session.
   */
  runId?: string;
  status: IngredientStatus;
  type: StudioGenerateType;
  url?: string;
  width?: number;
}

/** One submit, possibly with N output cards. */
export interface StudioGenerateRun {
  createdAt: number;
  id: string;
  jobs: StudioGenerateJob[];
}
