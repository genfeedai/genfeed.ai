import type { StoryboardFrame } from '@genfeedai/client/schemas';
import type { IngredientFormat, VideoTransition } from '@genfeedai/contracts';
import type {
  BrandRemixDraftEdits,
  BrandRemixRunView,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { BrandRemixRunSummary } from '@genfeedai/contracts/api-types/contracts/brand-remix-run-summary.contract';
import type { QuoteBrandRemixScenes } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import type { StoryboardCharacterReplacement } from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import type { StoryboardRunSummary } from '@genfeedai/contracts/api-types/contracts/storyboard-run-summary.contract';
import type { StoryboardSourceSelector } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import type {
  IImage,
  StoryboardRunRecipe,
  StoryboardRunSelectOption,
} from '@genfeedai/contracts/interfaces';
import type { IStoryboardMergeSettings } from '@genfeedai/contracts/interfaces/components/storyboard.interface';
import type { CameraMovementPreset } from '@genfeedai/contracts/interfaces/studio/camera-movement.interface';
import type { ReactNode, Ref } from 'react';
import type { MergeProgressStep } from './merge.props';

export interface StoryboardWorkspaceReference {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly kind: 'image' | 'video';
  readonly url?: string;
  readonly onRemove?: () => void;
  readonly onSelect?: () => void;
  readonly isSelected?: boolean;
}

export interface StoryboardReferencesPanelProps {
  readonly references: readonly StoryboardWorkspaceReference[];
  readonly actions?: ReactNode;
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

export interface StoryboardSelectOption extends StoryboardRunSelectOption {
  readonly isDisabled?: boolean;
}

export interface StoryboardSelectProps {
  readonly ariaLabel: string;
  readonly isDisabled?: boolean;
  readonly onChange: (value: string | undefined) => void;
  readonly options: ReadonlyArray<StoryboardSelectOption>;
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
  readonly binding?: StoryboardAutosaveBinding<T>;
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

export type StoryboardEditablePlan = NonNullable<
  StoryboardRun['config']['plan']
>;

export interface StoryboardPlanEditorHandle {
  flush: () => Promise<StoryboardSaveSnapshot<StoryboardEditablePlan>>;
}

export interface StoryboardCharacterReplaceProps {
  readonly brandId: string;
  readonly runId: string;
  readonly shotId: string;
  readonly isDisabled?: boolean;
  readonly saved?: StoryboardCharacterReplacement;
}

export interface StoryboardPlanEditorProps {
  readonly ref?: Ref<StoryboardPlanEditorHandle>;
  readonly run: StoryboardRun;
  readonly draft?: StoryboardAutosaveBinding<StoryboardEditablePlan>;
  readonly transport?: StoryboardDraftTransport;
  readonly isSourceSaving?: boolean;
  readonly onSaveStatusChange?: (
    status: StoryboardSaveIndicatorProps['status'],
  ) => void;
  readonly saveSource?: (
    revision: number,
    source: StoryboardSourceSelector,
  ) => Promise<StoryboardRun>;
  readonly capabilities?: StoryboardRunCapabilities;
  readonly capabilityError?: string;
  readonly refreshCapabilities?: () => void;
  readonly savePlan: (
    revision: number,
    plan: StoryboardEditablePlan,
    signal: AbortSignal,
    capabilityVersion?: string,
  ) => Promise<StoryboardRun>;
  readonly resetPlan: (revision: number) => Promise<StoryboardRun>;
  readonly approvePlan: (revision: number) => Promise<StoryboardRun>;
}

export type StoryboardDraftPageProps = Pick<
  StoryboardPlanEditorProps,
  | 'run'
  | 'transport'
  | 'saveSource'
  | 'savePlan'
  | 'resetPlan'
  | 'approvePlan'
  | 'capabilities'
  | 'capabilityError'
  | 'refreshCapabilities'
>;

export type StoryboardListRun = StoryboardRunSummary | BrandRemixRunSummary;

export interface StoryboardDraftValue {
  plan: StoryboardEditablePlan;
  source: StoryboardSourceSelector;
}
export interface StoryboardDraftScope {
  server: string;
  userId: string;
  organizationId: string;
  brandId: string;
  runId: string;
}
export interface StoryboardDraftConflict {
  path: string;
  label: string;
  local: unknown;
  remote: unknown;
}
export interface StoryboardDraftTransport {
  scope: StoryboardDraftScope;
  canDispatch: () => Promise<boolean>;
  read: () => Promise<StoryboardRun>;
  write: (
    channel: 'plan' | 'source',
    revision: number,
    value: StoryboardDraftValue,
  ) => Promise<StoryboardRun>;
}
export interface StoryboardAutosaveBinding<T> {
  scope: string;
  value: T;
  revision: number;
  status: StoryboardSaveIndicatorProps['status'];
  error?: string;
  canUndo: boolean;
  edit: (update: T | ((value: T) => T)) => void;
  flush: () => Promise<StoryboardSaveSnapshot<T>>;
  undo: () => Promise<StoryboardSaveSnapshot<T>>;
}

export interface StoryboardConflictReviewProps {
  conflicts: StoryboardDraftConflict[];
  choices: Record<string, 'local' | 'remote'>;
  choose: (path: string, choice: 'local' | 'remote') => void;
  resolve: () => Promise<void>;
}
export interface StoryboardCreationIntent {
  clientRequestId: string;
  uncertain?: boolean;
  owner: symbol;
  epoch: number;
  pending?: Promise<string>;
}

export interface StoryboardDraftFieldMerge {
  value: unknown;
  base: unknown;
}
