import type { IngredientFormat, ViewType } from '@genfeedai/contracts';
import type {
  IIngredient,
  IModel,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerationCostEstimate,
  StudioPlaygroundJob,
  StudioPlaygroundReferenceRole,
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { CharacterMentionSubmitResult } from '@genfeedai/helpers/content/character-mention.util';
import type { PromptEditorDocumentSeed } from '@genfeedai/props/prompt-bars/prompt-editor.props';
import type {
  PromptBarAttachedAsset,
  UseCrunGenerationQuoteReturn,
} from '@genfeedai/props/studio/prompt-bar.props';
import type { AnyExtension, JSONContent } from '@tiptap/core';
import type { ReactElement } from 'react';

/** Results-grid filter: one asset type, or every type at once. */
export type StudioPlaygroundFilter = StudioPlaygroundType | 'all';

export interface StudioIdentityFieldsProps {
  isDisabled?: boolean;
  onChange: (patch: Partial<StudioPlaygroundSettings>) => void;
  settings: StudioPlaygroundSettings;
  type: StudioPlaygroundType;
}

export interface StudioPlaygroundComposerProps {
  isCrunRestoreBlocked?: boolean;
  crunQuote?: UseCrunGenerationQuoteReturn;
  crunReferenceCount?: number;
  crunStartFrameId?: string;
  crunEndFrameId?: string;
  attachedAssets: PromptBarAttachedAsset[];
  documentSeed?: PromptEditorDocumentSeed | null;
  extraExtensions?: readonly AnyExtension[];
  isDragActive?: boolean;
  isEnhancingPrompt?: boolean;
  isGenerating: boolean;
  isListening: boolean;
  isLoadingModels: boolean;
  isTranscribing: boolean;
  isUploading: boolean;
  models: readonly IModel[];
  onAddFiles: (files: File[], role?: StudioPlaygroundReferenceRole) => void;
  onCancelEnhancePrompt?: () => void;
  onEnhancePrompt?: () => void;
  onOpenLibrary: (role?: StudioPlaygroundReferenceRole) => void;
  onPromptChange: (value: string) => void;
  onPromptDocumentChange?: (document: JSONContent) => void;
  onRemoveAttachedAsset: (assetId: string) => void;
  onResetSettings: () => void;
  onSettingsChange: (patch: Partial<StudioPlaygroundSettings>) => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onSubmit: () => void;
  onTypeChange: (type: StudioPlaygroundType) => void;
  onUndoEnhancePrompt?: () => void;
  prompt: string;
  /** Set only once an enhancement has actually replaced the prompt. */
  previousPrompt?: string | null;
  settings: StudioPlaygroundSettings;
  /** Org Voice Control is on and the browser can record; the composer decides placement. */
  isVoiceInputAvailable: boolean;
  type: StudioPlaygroundType;
}

export interface StudioTypeDropdownProps {
  className?: string;
  isDisabled?: boolean;
  onChange: (type: StudioPlaygroundType) => void;
  type: StudioPlaygroundType;
}

export interface StudioFailedIngredientRecoveryActions {
  onRetryFailedIngredient(ingredient: IIngredient): void;
  onReviewFailedIngredient(ingredient: IIngredient): Promise<void>;
  isRecovering: boolean;
  retriedIds: readonly string[];
}

export interface StudioPlaygroundAssetActions {
  failedRecovery?: StudioFailedIngredientRecoveryActions;
  onCancelGeneration?: (job: StudioPlaygroundJob) => void | Promise<void>;
  onClickIngredient: (ingredient: IIngredient) => void;
  onConvertToVideo: (ingredient: IIngredient) => void;
  onCopyPrompt: (ingredient: IIngredient) => void | Promise<void>;
  onCreateVariation: (ingredient: IIngredient) => void;
  onDeleteIngredient: (ingredient: IIngredient) => void;
  onMarkArchived: (ingredient: IIngredient) => void | Promise<void>;
  onMarkRejected: (ingredient: IIngredient) => void | Promise<void>;
  onMarkValidated: (ingredient: IIngredient) => void | Promise<void>;
  onOpenInEditor: (ingredient: IIngredient) => void;
  onPublishIngredient: (ingredient: IIngredient) => void;
  onRefresh: () => void;
  onRemoveGeneration: (job: StudioPlaygroundJob) => void;
  onResize: (
    ingredient: IIngredient,
    format: IngredientFormat,
  ) => void | Promise<void>;
  onSeeDetails: (ingredient: IIngredient) => void;
  onToggleFavorite: (ingredient: IIngredient) => void | Promise<void>;
  onUseAsVideoReference: (ingredient: IIngredient) => void;
}

/**
 * A first-run idea for one kind of Studio output. Copy lives in next-intl
 * under `pages.studioPlayground.starterIdeas.<id>`.
 */
export interface StudioPlaygroundStarterIdea {
  aspectRatio?: string;
  /** Template used when the brand has a character to tag. */
  characterPromptTemplate?: string;
  id:
    | 'avatarIntro'
    | 'cinematicVideo'
    | 'productAd'
    | 'productPhoto'
    | 'soundtrack'
    | 'voiceover';
  instrumental?: boolean;
  promptTemplate?: string;
  type: StudioPlaygroundType;
  /** Image and video ideas can insert a real `@character` chip. */
  usesCharacter: boolean;
  /** Product photo and product ad attach a brand product still. */
  usesProductReference: boolean;
}

/** Brand-kit product still a starter card can attach. The card chooses the role. */
export interface StudioPlaygroundStarterProductReference {
  id: string;
  /** Kit display name. The card supplies a fallback when this is absent. */
  label?: string;
  previewUrl: string;
}

/** Product still written onto the composer when a product idea is chosen. */
export interface StudioPlaygroundStarterAttachedProduct {
  id: string;
  label: string;
  previewUrl: string;
  role: StudioPlaygroundReferenceRole;
}

/** What a starter card applies: rich prompt plus the setup that idea is known for. */
export interface StudioPlaygroundStarterSelection {
  aspectRatio?: string;
  content: JSONContent;
  instrumental?: boolean;
  /** Set when a product idea has no product still, so the library can supply one. */
  openLibraryRole?: StudioPlaygroundReferenceRole;
  productReference?: StudioPlaygroundStarterAttachedProduct;
  promptTemplate?: string;
  seedId: string;
  type: StudioPlaygroundType;
}

/** The `@` chip a starter idea can insert. Matches `characterMention` attrs. */
export interface StudioPlaygroundStarterCharacter {
  handle: string;
  id: string;
  label: string;
}

/** A brand character the starter row may tag. Prefer one with a reference image. */
export interface StudioPlaygroundStarterCharacterCandidate
  extends StudioPlaygroundStarterCharacter {
  hasReferenceImage?: boolean;
}

export interface StudioPlaygroundStarterIdeasProps {
  character?: StudioPlaygroundStarterCharacter;
  isDisabled?: boolean;
  onSelect: (selection: StudioPlaygroundStarterSelection) => void;
  productReference?: StudioPlaygroundStarterProductReference;
}

export interface StudioPlaygroundResultsProps {
  assetActions: StudioPlaygroundAssetActions;
  isLoading: boolean;
  jobs: readonly StudioPlaygroundJob[];
  onReprompt: (job: StudioPlaygroundJob) => void;
  onSelect: (job: StudioPlaygroundJob) => void;
  /**
   * Ready assets the open composer can accept. Omit to keep every ready
   * image, edit, video, and avatar actionable.
   */
  isUseAsReferenceEnabled?: (job: StudioPlaygroundJob) => boolean;
  /** Attaches a ready asset to the open composer without changing its type. */
  onUseAsReference?: (job: StudioPlaygroundJob) => void;
  selectedJobId?: string | null;
  view: ViewType.GRID | ViewType.LIST;
}

export interface StudioPlaygroundCardProps {
  assetActions: StudioPlaygroundAssetActions;
  isSelected?: boolean;
  job: StudioPlaygroundJob;
  /** The job this one was transformed from, when it is in the gallery. */
  parentJob?: StudioPlaygroundJob | null;
  onReprompt: (job: StudioPlaygroundJob) => void;
  onSelect: (job: StudioPlaygroundJob) => void;
  /**
   * False when the open composer cannot accept this asset. Omit to show the
   * action for every ready image, edit, video, and avatar.
   */
  isUseAsReferenceEnabled?: boolean;
  /** Attaches a ready asset to the open composer without changing its type. */
  onUseAsReference?: (job: StudioPlaygroundJob) => void;
  view: ViewType.GRID | ViewType.LIST;
}

export interface StudioPlaygroundInspectorProps {
  job: StudioPlaygroundJob;
  /** Attaches a finished image to the composer as an image reference. */
  onRemix: (job: StudioPlaygroundJob) => void;
  onEdit?: (job: StudioPlaygroundJob) => void;
  onSelect: (job: StudioPlaygroundJob) => void;
  onUseInPost: (ingredient: IIngredient) => void;
  onVary: (job: StudioPlaygroundJob) => void;
  runJobs: readonly StudioPlaygroundJob[];
}

export interface StudioGenerationSummaryProps {
  children: ReactElement;
  isDisabled?: boolean;
  label: string;
  crunQuote?: UseCrunGenerationQuoteReturn;
  estimate: StudioGenerationCostEstimate;
  model?: IModel;
  type: StudioPlaygroundType;
}

export interface PrepareCrunGenerationIntentProps {
  document: unknown;
  existingReferenceIds: readonly string[];
  prompt: string;
  resolvePromptCommands: (prompt: string) => {
    content: string;
    skillSlugs: string[];
  };
  resolveCharacterMentions: (input: {
    document: unknown;
    existingReferenceIds: readonly string[];
    text: string;
  }) => CharacterMentionSubmitResult;
}

export interface BuildStudioCrunQuoteRequestProps {
  model?: IModel;
  settings: StudioPlaygroundSettings;
  promptText: string;
  references: string[];
  brandId: string;
  promptId?: string;
  requestedSkillSlugs?: string[];
  knowledge?: KnowledgeSelection;
  harness?: boolean;
}

export interface BuildStudioCrunVideoQuoteRequestProps
  extends BuildStudioCrunQuoteRequestProps {
  endFrameId?: string;
  parentId?: string;
}
