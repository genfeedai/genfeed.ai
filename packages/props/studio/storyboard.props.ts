import type { StoryboardFrame } from '@genfeedai/client/schemas';
import type {
  IngredientFormat,
  VideoEaseCurve,
  VideoTransition,
} from '@genfeedai/contracts';
import type {
  BrandRemixDraftEdits,
  BrandRemixRunView,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { QuoteBrandRemixScenes } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import type {
  IImage,
  StoryboardRunRecipe,
  StoryboardRunSelectOption,
} from '@genfeedai/contracts/interfaces';
import type { IStoryboardMergeSettings } from '@genfeedai/contracts/interfaces/components/storyboard.interface';
import type { CameraMovementPreset } from '@genfeedai/contracts/interfaces/studio/camera-movement.interface';
import type { MergeProgressStep } from './merge.props';

export interface EaseCurveSelectorProps {
  value?: VideoEaseCurve;
  onChange: (value: VideoEaseCurve | undefined) => void;
  label?: string;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
  dropdownDirection?: 'up' | 'down' | 'left' | 'right';
  isFullWidth?: boolean;
}

export interface TransitionSelectorProps {
  value?: VideoTransition;
  onChange: (value: VideoTransition | undefined) => void;
  label?: string;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
  dropdownDirection?: 'up' | 'down' | 'left' | 'right';
  isFullWidth?: boolean;
}

export interface StoryboardSceneRowProps {
  frame: StoryboardFrame;
  isBusy: boolean;
  onChange: (frameId: string, patch: Partial<StoryboardFrame>) => void;
  onRemove: (frameId: string) => void;
  onRetry: (frameId: string) => void;
}

export interface StoryboardMergeSettingsPanelProps {
  isDisabled: boolean;
  settings: IStoryboardMergeSettings;
  onChange: (patch: Partial<IStoryboardMergeSettings>) => void;
}

export interface StoryboardMergeProgressPanelProps {
  overallProgress: number;
  steps: MergeProgressStep[];
  onDismiss: () => void;
}

export interface StoryboardPanelProps {
  cameraMovementPreset: CameraMovementPreset;
  customCameraPrompt: string;
  format: IngredientFormat;
  frames: IImage[];
  hasInterpolationModel: boolean;
  isGenerating: boolean;
  onCameraMovementPresetChange: (preset: CameraMovementPreset) => void;
  onClear: () => void;
  onCustomCameraPromptChange: (prompt: string) => void;
  onFramesChange: (frames: IImage[]) => void;
  onGenerate: () => void;
}

/** Scene-pipeline commands a storyboard run exposes to its shot editor. */
export interface StoryboardRunSceneActions {
  readonly attachSceneSource: (assetId: string | null) => Promise<void>;
  readonly cancelScenes: () => Promise<void>;
  readonly executeScenes: () => Promise<void>;
  readonly quoteScenes: (
    input: Omit<QuoteBrandRemixScenes, 'expectedRevision'>,
  ) => Promise<void>;
  readonly resumeScenes: () => Promise<void>;
  readonly saveScenes: (edits: BrandRemixDraftEdits) => Promise<void>;
}

export interface StoryboardRunScenesProps {
  readonly actions: StoryboardRunSceneActions;
  readonly isWorking: boolean;
  readonly run: BrandRemixRunView;
}

export interface StoryboardRunPanelProps {
  readonly error: string | null;
  readonly isWorking: boolean;
  readonly onPreparePaidDraft?: () => void;
  readonly onReview: (variantIds: string[]) => void;
  readonly onVary: () => void;
  readonly run: BrandRemixRunView;
  readonly sceneActions?: StoryboardRunSceneActions;
}

export interface StoryboardRunRecipeProps {
  readonly isWorking: boolean;
  readonly onGenerate: (recipe: StoryboardRunRecipe) => void;
  readonly run: BrandRemixRunView;
}

export interface StoryboardSelectProps {
  readonly ariaLabel: string;
  readonly isDisabled?: boolean;
  readonly onChange: (value: string | undefined) => void;
  readonly options: ReadonlyArray<StoryboardRunSelectOption>;
  readonly placeholder: string;
  readonly value: string | undefined;
}

export interface StoryboardRunPageProps {
  readonly runId: string;
}

export interface StoryboardAnimaticShot {
  readonly id: string;
  readonly ordinal: number;
  readonly durationSeconds: number | null;
  readonly stillUrl?: string;
  readonly dialogue?: string;
}

export interface StoryboardAnimaticProps {
  readonly scope: string;
  readonly shots: readonly StoryboardAnimaticShot[];
}

export interface StoryboardSaveSnapshot<T> {
  readonly revision: number;
  readonly value: T;
}

export interface StoryboardAutosaveOptions<T> {
  readonly scope: string;
  readonly initial: StoryboardSaveSnapshot<T>;
  readonly save: (
    snapshot: StoryboardSaveSnapshot<T>,
    signal: AbortSignal,
  ) => Promise<StoryboardSaveSnapshot<T>>;
}

export interface StoryboardEditorSeedInput {
  readonly isReady: boolean;
  readonly shotIds: readonly string[];
  readonly videos: Readonly<
    Record<string, { readonly state: string; readonly assetId?: string }>
  >;
  readonly assembly?: { readonly state: string; readonly assetId?: string };
}

export interface StoryboardRuntimeRailProps {
  readonly budgetSeconds: number | null;
  readonly shots: readonly Pick<
    StoryboardAnimaticShot,
    'id' | 'ordinal' | 'durationSeconds'
  >[];
  readonly selectedShotId?: string;
  readonly onSelectShot: (shotId: string) => void;
}

export interface StoryboardSaveIndicatorProps {
  readonly status: 'saved' | 'saving' | 'failed' | 'dirty';
  readonly error?: string;
  readonly onRetry: () => void;
}
