import type { EditorTrackType } from '@genfeedai/contracts';
import type {
  IEditorClip,
  IEditorTrack,
} from '@genfeedai/contracts/interfaces';

export interface EditorTimelineProps {
  tracks: IEditorTrack[];
  currentFrame: number;
  totalFrames: number;
  fps: number;
  zoom: number; // pixels per frame
  onSeek: (frame: number) => void;
  onTrackUpdate: (trackId: string, track: Partial<IEditorTrack>) => void;
  onClipMove: (trackId: string, clipId: string, newStartFrame: number) => void;
  onClipResize: (
    trackId: string,
    clipId: string,
    newDuration: number,
    fromStart: boolean,
  ) => void;
  onClipSelect: (trackId: string, clipId: string) => void;
  selectedClipId: string | null;
}

export interface TrackRowProps {
  track: IEditorTrack;
  zoom: number;
  selectedClipId: string | null;
  onClipSelect: (clipId: string) => void;
  onClipMove: (clipId: string, newStartFrame: number) => void;
  onClipResize: (
    clipId: string,
    newDuration: number,
    fromStart: boolean,
  ) => void;
}

export interface ClipBlockProps {
  clip: IEditorClip;
  trackType: EditorTrackType;
  zoom: number;
  isSelected: boolean;
  isLocked: boolean;
  onSelect: () => void;
  onMove: (newStartFrame: number) => void;
  onResize: (newDuration: number, fromStart: boolean) => void;
}
