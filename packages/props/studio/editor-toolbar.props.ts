import type { IngredientFormat } from '@genfeedai/contracts';
import type { EditorSaveStatus } from '@props/studio/editor-save.props';

export interface EditorToolbarProps {
  projectName: string;
  format: IngredientFormat;
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  zoom: number;
  isDirty: boolean;
  saveStatus: EditorSaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  isRendering: boolean;
  isReadOnly?: boolean;
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
  onUndo: () => void;
  onRedo: () => void;
  onRender: () => void;
  onBack: () => void;
}
