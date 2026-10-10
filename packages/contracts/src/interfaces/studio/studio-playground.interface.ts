import type { ReactNode } from 'react';
import type {
  IngredientCategory,
  IngredientStatus,
  ModelCategory,
  RouterPriority,
} from '../..';
import type { ImageEditSize } from '../../constants/image-edit-models.constant';
import type { AgentGenerationQuoteUnavailableReason } from '../ai/agent-generation-quote.interface';
import type { IBaseEntity, IIngredient, IQueryParams } from '../index';
import type { HeyGenAvatarRef } from '../integrations/heygen.interface';
import type { KnowledgeSelection } from '../knowledge-base/knowledge-retrieval.interface';
import type { IBrandAgentConfig } from '../organization/brand.interface';
import type { ImageEditingRecipe } from './image-editing.interface';

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
  /** Platform default shared with every organization; pickers mark it "Default". */
  isPlatformDefault?: boolean;
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
  findOne(
    id: string,
    query?: Partial<IQueryParams>,
    signal?: AbortSignal,
  ): Promise<IIngredient | null>;
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
 * state, never a URL segment — `/studio/playground` is the only route.
 */
export type StudioPlaygroundType =
  | 'image'
  | 'image-edit'
  | 'video'
  | 'music'
  | 'avatar'
  | 'voice';

/**
 * Which controls the settings popover and composer expose for a given type.
 * Keeps the UI declarative instead of branching on the type string in JSX.
 */
export interface StudioPlaygroundCapabilities {
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
  /** Whether the resolved model accepts an instrumental/vocals toggle (music only). */
  hasInstrumentalToggle: boolean;
  hasLook: boolean;
  /** Whether the resolved model accepts explicit lyrics/composition text (music only). */
  hasLyrics: boolean;
  hasModelSelection: boolean;
  hasOutputs: boolean;
  hasReferences: boolean;
  hasSpeech: boolean;
  /**
   * Genre/style descriptor text (music only). Unlike lyrics/instrumental,
   * every music provider honors it the same way — folded into the prompt
   * text server-side — so it needs no per-model narrowing.
   */
  hasStyle: boolean;
}

export interface StudioPlaygroundTypeConfig {
  capabilities: StudioPlaygroundCapabilities;
  /** `type` option passed to `useElements` so the gear only loads relevant elements. */
  elementsType: 'all' | 'image' | 'music' | 'video' | 'voice';
  ingredientCategory: IngredientCategory;
  label: string;
  /** `null` for types that have no router-backed model catalog (avatar, voice). */
  modelCategory: ModelCategory | null;
  /** Socket topic + REST collection segment, e.g. `images`. */
  resourceSegment: string;
  type: StudioPlaygroundType;
}

/**
 * Everything the gear popover owns. Persisted per type so switching Image →
 * Video → Image restores the operator's last setup.
 */
export interface StudioCrunControls {
  negativePrompt?: string;
  guidanceScale?: number;
  translatePrompt?: boolean;
  modelKey: string;
  contractVersion: string;
  outputFormat?: string;
  aspectRatio?: string;
}

export interface StudioPlaygroundSettings {
  crunControls?: StudioCrunControls;
  editSize?: ImageEditSize;
  editSeed?: number;
  editPrimaryId?: string;
  aspectRatio: string;
  /** Public URL of the chosen portrait, posted as `photoUrl`. */
  avatarPhotoUrl?: string;
  avatarRef?: HeyGenAvatarRef;
  voiceRef?: NonNullable<IBrandAgentConfig['defaultVoiceRef']>;
  blacklist: string[];
  brandingMode: 'brand' | 'off';
  camera?: string;
  cameraMovement?: string;
  duration?: number;
  folder?: string;
  instrumental?: boolean;
  isAudioEnabled: boolean;
  lens?: string;
  lighting?: string;
  lyrics?: string;
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
 * `buildStudioPromptData`. Effective text remains inspectable; continuations
 * restore only the separately captured original user draft.
 */
export interface StudioPlaygroundRecipe {
  crunControls?: StudioCrunControls;
  endFrameId?: string;
  imageEdit?: ImageEditingRecipe;
  aspectRatio?: string;
  blacklist: string[];
  /**
   * Undefined means the source this recipe was built from does not know the
   * brand state actually applied (e.g. a reprompt/legacy ingredient with no
   * stored brand data) — distinct from a known `'off'`. Callers must not
   * treat "unknown" as "off" (#4676): patching settings from an unknown
   * recipe must leave the current `brandingMode` alone.
   */
  brandingMode?: 'brand' | 'off';
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
  /** Exact user draft before command resolution, enhancement and enrichment. */
  originalText?: string;
  promptTemplate?: string;
  references: string[];
  resolution?: string;
  scene?: string;
  speech?: string;
  style?: string;
  tags: string[];
  text: string;
  type: StudioPlaygroundType;
}

export interface StudioPlaygroundJob {
  phase?: 'submitting' | 'queued' | 'generating' | 'saving' | 'cancelled';
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
  /**
   * Source ingredient a transformation (extend, upscale, reframe, resize,
   * GIF) was produced from. Absent on first-generation outputs.
   */
  parentId?: string;
  prompt: string;
  /**
   * Enriched prompt payload stamped at submit. Survives session rehydrate so
   * the inspector can show what reached the provider, not the raw box.
   */
  recipe?: StudioPlaygroundRecipe;
  /**
   * Client-stamped id shared by every output of one submit. Absent on
   * gallery rows that were generated outside this session.
   */
  runId?: string;
  status: IngredientStatus;
  type: StudioPlaygroundType;
  url?: string;
  width?: number;
}

/** One submit, possibly with N output cards. */
export interface StudioPlaygroundRun {
  createdAt: number;
  id: string;
  jobs: StudioPlaygroundJob[];
}

/**
 * What the asset panel states about one generation. Every field is optional:
 * a live job knows less than a hydrated gallery row, and missing facts are
 * omitted rather than guessed. Credits wait for an API field.
 */
export interface StudioPlaygroundAssetFacts {
  aspectRatio?: string;
  brandLabel?: string;
  createdAt?: Date;
  durationSeconds?: number;
  modelLabel?: string;
}

/** How a composer reference feeds the generation request. */
export type StudioPlaygroundReferenceRole =
  | 'reference'
  | 'editSource'
  | 'editMask'
  | 'startFrame'
  | 'endFrame'
  | 'videoReference';

/** One Library asset the composer draft points at, with its role. */
export interface StudioGenerateDraftReference {
  id: string;
  role: StudioPlaygroundReferenceRole;
}

/**
 * The Generate composer as it is autosaved per user and brand. Settings are
 * stored per asset type so switching Image → Video restores both setups on
 * another device; `attachments` are composer uploads, already Library assets.
 */
export interface StudioGenerateDraftPayload {
  attachments: StudioGenerateDraftReference[];
  knowledgeSelection: KnowledgeSelection;
  prompt: string;
  references: StudioGenerateDraftReference[];
  settingsByType: Partial<
    Record<StudioPlaygroundType, Partial<StudioPlaygroundSettings>>
  >;
  type: StudioPlaygroundType;
}

export interface IStudioGenerateDraft
  extends StudioGenerateDraftPayload,
    IBaseEntity {
  brandId: string;
  /**
   * Reference and attachment ids removed from this response because the
   * asset was deleted or is outside the draft's organization and brand.
   */
  droppedReferenceIds: string[];
  organizationId: string;
  userId: string;
}

/** Autosave state of the composer draft, shown next to the prompt bar. */
export type StudioGenerateDraftSaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  /** A save failed and is being retried. */
  | 'error'
  /** The server rejected the draft; it will not be retried. */
  | 'failed';

/**
 * What the Studio summary shows. Credits only ever come from the server quote
 * admission charges; `unavailableReason` is that quote's code when it declined.
 */
export interface StudioGenerationCostEstimate {
  credits: number | null;
  status: 'auto' | 'loading' | 'unavailable' | 'estimated';
  unavailableReason?: AgentGenerationQuoteUnavailableReason;
}
