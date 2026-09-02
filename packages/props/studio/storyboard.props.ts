import type { StoryboardFrame } from '@genfeedai/client/schemas';
import type {
  IngredientFormat,
  VideoEaseCurve,
  VideoTransition,
} from '@genfeedai/contracts';
import type { IImage } from '@genfeedai/contracts/interfaces';
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
