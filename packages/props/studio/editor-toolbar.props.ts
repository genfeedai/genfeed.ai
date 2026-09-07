import type { IngredientFormat } from '@genfeedai/contracts';

export interface EditorToolbarProps {
  projectName: string;
  format: IngredientFormat;
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  zoom: number;
  isDirty: boolean;
  isRendering: boolean;
  onPlayPause: () => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onZoomChange: (zoom: number) => void;
  onFormatChange: (format: IngredientFormat) => void;
  onAddVideoTrack: () => void;
  onAddAudioTrack: () => void;
  onSave: () => void;
  onRender: () => void;
  onBack: () => void;
}
