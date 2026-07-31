import type { StoryboardFrame } from '@genfeedai/client/schemas';
import type { VideoEaseCurve, VideoTransition } from '@genfeedai/enums';
import type { IStoryboardMergeSettings } from '@genfeedai/interfaces/components/storyboard.interface';
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
