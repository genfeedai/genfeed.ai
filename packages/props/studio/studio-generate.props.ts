import type { IngredientFormat, ViewType } from '@genfeedai/contracts';
import type {
  IIngredient,
  IModel,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerateJob,
  StudioGenerateReferenceRole,
  StudioGenerateSettings,
  StudioGenerateType,
  StudioGenerationCostEstimate,
} from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import type { CharacterMentionSubmitResult } from '@genfeedai/helpers/content/character-mention.util';
import type { PromptEditorDocumentSeed } from '@genfeedai/props/prompt-bars/prompt-editor.props';
import type {
  PromptBarAttachedAsset,
  UseCrunGenerationQuoteReturn,
} from '@genfeedai/props/studio/prompt-bar.props';
import type { AnyExtension, JSONContent } from '@tiptap/core';

/** Results-grid filter: one asset type, or every type at once. */
export type StudioGenerateFilter = StudioGenerateType | 'all';

export interface StudioIdentityFieldsProps {
  isDisabled?: boolean;
  onChange: (patch: Partial<StudioGenerateSettings>) => void;
  settings: StudioGenerateSettings;
  type: StudioGenerateType;
}

export interface StudioGenerateComposerProps {
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
  onAddFiles: (files: File[], role?: StudioGenerateReferenceRole) => void;
  onCancelEnhancePrompt?: () => void;
  onEnhancePrompt?: () => void;
  onOpenLibrary: (role?: StudioGenerateReferenceRole) => void;
  onPromptChange: (value: string) => void;
  onPromptDocumentChange?: (document: JSONContent) => void;
  onRemoveAttachedAsset: (assetId: string) => void;
  onResetSettings: () => void;
  onSettingsChange: (patch: Partial<StudioGenerateSettings>) => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onSubmit: () => void;
  onTypeChange: (type: StudioGenerateType) => void;
  onUndoEnhancePrompt?: () => void;
  prompt: string;
  /** Set only once an enhancement has actually replaced the prompt. */
  previousPrompt?: string | null;
  settings: StudioGenerateSettings;
  shouldShowVoiceInput: boolean;
  type: StudioGenerateType;
}

export interface StudioGenerateAssetActions {
  onCancelGeneration?: (job: StudioGenerateJob) => void | Promise<void>;
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
  onRemoveGeneration: (job: StudioGenerateJob) => void;
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
 * under `pages.studioGenerate.starterIdeas.<id>`.
 */
export interface StudioGenerateStarterIdea {
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
  type: StudioGenerateType;
  /** Image and video ideas can insert a real `@character` chip. */
  usesCharacter: boolean;
  /** Product photo and product ad attach a brand product still. */
  usesProductReference: boolean;
}

/** Brand-kit product still a starter card can attach. The card chooses the role. */
export interface StudioGenerateStarterProductReference {
  id: string;
  /** Kit display name. The card supplies a fallback when this is absent. */
  label?: string;
  previewUrl: string;
}

/** Product still written onto the composer when a product idea is chosen. */
export interface StudioGenerateStarterAttachedProduct {
  id: string;
  label: string;
  previewUrl: string;
  role: StudioGenerateReferenceRole;
}

/** What a starter card applies: rich prompt plus the setup that idea is known for. */
export interface StudioGenerateStarterSelection {
  aspectRatio?: string;
  content: JSONContent;
  instrumental?: boolean;
  /** Set when a product idea has no product still, so the library can supply one. */
  openLibraryRole?: StudioGenerateReferenceRole;
  productReference?: StudioGenerateStarterAttachedProduct;
  promptTemplate?: string;
  seedId: string;
  type: StudioGenerateType;
}

/** The `@` chip a starter idea can insert. Matches `characterMention` attrs. */
export interface StudioGenerateStarterCharacter {
  handle: string;
  id: string;
  label: string;
}

/** A brand character the starter row may tag. Prefer one with a reference image. */
export interface StudioGenerateStarterCharacterCandidate
  extends StudioGenerateStarterCharacter {
  hasReferenceImage?: boolean;
}

export interface StudioGenerateStarterIdeasProps {
  character?: StudioGenerateStarterCharacter;
  isDisabled?: boolean;
  onSelect: (selection: StudioGenerateStarterSelection) => void;
  productReference?: StudioGenerateStarterProductReference;
}

export interface StudioGenerateResultsProps {
  assetActions: StudioGenerateAssetActions;
  isLoading: boolean;
  jobs: readonly StudioGenerateJob[];
  onReprompt: (job: StudioGenerateJob) => void;
  onSelect: (job: StudioGenerateJob) => void;
  selectedJobId?: string | null;
  view: ViewType.GRID | ViewType.LIST;
}

export interface StudioGenerateCardProps {
  assetActions: StudioGenerateAssetActions;
  isSelected?: boolean;
  job: StudioGenerateJob;
  /** The job this one was transformed from, when it is in the gallery. */
  parentJob?: StudioGenerateJob | null;
  onReprompt: (job: StudioGenerateJob) => void;
  onSelect: (job: StudioGenerateJob) => void;
  view: ViewType.GRID | ViewType.LIST;
}

export interface StudioGenerateInspectorProps {
  job: StudioGenerateJob;
  /** Attaches a finished image to the composer as an image reference. */
  onRemix: (job: StudioGenerateJob) => void;
  onSelect: (job: StudioGenerateJob) => void;
  onUseInPost: (ingredient: IIngredient) => void;
  onVary: (job: StudioGenerateJob) => void;
  runJobs: readonly StudioGenerateJob[];
}

export interface StudioGenerationSummaryProps {
  crunQuote?: UseCrunGenerationQuoteReturn;
  estimate: StudioGenerationCostEstimate;
  isLoadingModels: boolean;
  model?: IModel;
  settings: StudioGenerateSettings;
  type: StudioGenerateType;
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
  settings: StudioGenerateSettings;
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
