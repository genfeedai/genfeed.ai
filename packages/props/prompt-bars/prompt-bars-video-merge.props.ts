import type {
  IngredientFormat,
  VideoEaseCurve,
  VideoTransition,
} from '@genfeedai/enums';

interface SelectedMusic {
  metadataLabel?: string | null;
}

interface VideoMergeStoryboard {
  format: IngredientFormat;
  isCaptionsEnabled?: boolean;
  isMuteVideoAudio?: boolean;
  musicVolume?: number;
  transition?: VideoTransition;
  transitionDuration?: number;
  transitionEaseCurve?: VideoEaseCurve;
}

export interface VideoMergePromptBarProps {
  storyboard: VideoMergeStoryboard;
  onFormatChange: (format: IngredientFormat) => void;
  onCaptionsToggle: (enabled: boolean) => void;
  onTransitionChange: (transition: VideoTransition) => void;
  onTransitionDurationChange: (duration: number) => void;
  onTransitionEaseCurveChange: (curve: VideoEaseCurve | undefined) => void;
  onOpenMusicModal: () => void;
  onMuteVideoAudioToggle: (enabled: boolean) => void;
  onMusicVolumeChange: (volume: number) => void;
  onMergeVideos: () => void;
  onClearAll: () => void;
  isMerging?: boolean;
  canMerge?: boolean;
  selectedMusic?: SelectedMusic | null;
  totalFrames: number;
  completedFrames: number;
  totalDuration: number;
}
