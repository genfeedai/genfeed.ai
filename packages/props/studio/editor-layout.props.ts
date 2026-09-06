import type { IngredientFormat } from '@genfeedai/contracts';
import type {
  IEditorProject,
  IEditorTrack,
} from '@genfeedai/contracts/interfaces';
import type { EditorPreviewRef } from '@props/studio/editor-preview.props';
import type { RefObject } from 'react';

export interface EditorLayoutProps {
  project: IEditorProject;
  previewRef: RefObject<EditorPreviewRef | null>;
  isPlaying: boolean;
  currentFrame: number;
  zoom: number;
  isDirty: boolean;
  isRendering: boolean;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onPlayPause: () => void;
  onSeek: (frame: number) => void;
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
  onAddTextTrack: (newTrack: IEditorTrack) => void;
  onTrackUpdate: (trackId: string, trackUpdates: Partial<IEditorTrack>) => void;
  onClipMove: (trackId: string, clipId: string, newStartFrame: number) => void;
  onClipResize: (
    trackId: string,
    clipId: string,
    newDuration: number,
    fromStart: boolean,
  ) => void;
  onClipSelect: (trackId: string, clipId: string) => void;
  onFrameChange: (frame: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
}
