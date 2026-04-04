import type { IEditorTrack } from '@cloud/interfaces';

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
