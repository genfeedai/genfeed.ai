'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IEditorTrack } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';

interface EditorTextTrackListProps {
  textTracks: IEditorTrack[];
  fps: number;
  selectedClipId: string | null;
  onClipSelect: (trackId: string, clipId: string) => void;
  onDeleteTrack: (trackId: string) => void;
}

function EditorTextTrackList({
  textTracks,
  fps,
  selectedClipId,
  onClipSelect,
  onDeleteTrack,
}: EditorTextTrackListProps) {
  if (textTracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-muted-foreground">
        <span className="text-xs text-center">
          No text layers yet. Use Add Text to create one.
        </span>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/80">
      {textTracks.map((track) =>
        track.clips.map((clip) => (
          <div key={clip.id} className="group relative">
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={() => onClipSelect(track.id, clip.id)}
              className={`flex w-full flex-col items-start gap-1 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                selectedClipId === clip.id
                  ? 'bg-primary/10 border-l-2 border-primary'
                  : ''
              }`}
            >
              <span className="truncate font-medium">
                {clip.textOverlay?.text || 'Empty Text'}
              </span>
              <span className="text-xs text-muted-foreground">
                {track.name} · {Math.round(clip.durationFrames / fps)}s
              </span>
            </Button>
            <Button
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              onClick={() => onDeleteTrack(track.id)}
              className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-destructive"
            >
              Delete
            </Button>
          </div>
        )),
      )}
    </div>
  );
}

export default EditorTextTrackList;
