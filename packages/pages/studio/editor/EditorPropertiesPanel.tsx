'use client';

import type { IEditorClip, IEditorTrack } from '@genfeedai/interfaces';
import { ButtonSize, ButtonVariant, EditorTrackType } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Input } from '@ui/primitives/input';
import { Slider } from '@ui/primitives/slider';
import { useCallback } from 'react';

interface EditorPropertiesPanelProps {
  tracks: IEditorTrack[];
  fps: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onTrackUpdate: (trackId: string, updates: Partial<IEditorTrack>) => void;
}

function formatFramesAsTime(frames: number, fps: number): string {
  const totalSeconds = frames / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function EditorPropertiesPanel({
  tracks,
  fps,
  selectedTrackId,
  selectedClipId,
  onTrackUpdate,
}: EditorPropertiesPanelProps) {
  const selectedTrack = selectedTrackId
    ? tracks.find((t) => t.id === selectedTrackId)
    : null;

  const selectedClip = (() => {
    if (!selectedTrack || !selectedClipId) return null;
    return selectedTrack.clips.find((c) => c.id === selectedClipId) ?? null;
  })();

  const handleClipUpdate = useCallback(
    (updates: Partial<IEditorClip>) => {
      if (!selectedTrackId || !selectedClipId || !selectedTrack) return;

      const updatedClips = selectedTrack.clips.map((clip) => {
        if (clip.id !== selectedClipId) return clip;
        return { ...clip, ...updates };
      });

      onTrackUpdate(selectedTrackId, { clips: updatedClips });
    },
    [selectedTrackId, selectedClipId, selectedTrack, onTrackUpdate],
  );

  const handleTrackNameUpdate = useCallback(
    (name: string) => {
      if (!selectedTrackId) return;
      onTrackUpdate(selectedTrackId, { name });
    },
    [selectedTrackId, onTrackUpdate],
  );

  const handleVolumeUpdate = useCallback(
    (volume: number) => {
      if (!selectedTrackId) return;
      onTrackUpdate(selectedTrackId, { volume });
    },
    [selectedTrackId, onTrackUpdate],
  );

  const handleToggleMute = useCallback(() => {
    if (!selectedTrack) return;
    onTrackUpdate(selectedTrack.id, { isMuted: !selectedTrack.isMuted });
  }, [selectedTrack, onTrackUpdate]);

  const handleToggleLock = useCallback(() => {
    if (!selectedTrack) return;
    onTrackUpdate(selectedTrack.id, { isLocked: !selectedTrack.isLocked });
  }, [selectedTrack, onTrackUpdate]);

  if (!selectedTrack || !selectedClip) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <span className="text-xs">Select a clip to view its properties</span>
      </div>
    );
  }

  const trackTypeLabel =
    selectedTrack.type === EditorTrackType.VIDEO
      ? 'Video'
      : selectedTrack.type === EditorTrackType.AUDIO
        ? 'Audio'
        : 'Text';

  return (
    <div className="p-3 space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase">
        Clip Properties
      </h3>

      {/* Track info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">{trackTypeLabel}</span>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Track Name
          </label>
          <Input
            type="text"
            value={selectedTrack.name}
            onChange={(e) => handleTrackNameUpdate(e.target.value)}
          />
        </div>
      </div>

      {/* Timing */}
      <div className="space-y-2 border-t border-white/[0.08] pt-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">
          Timing
        </h4>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Start
            </label>
            <div className="text-sm font-mono bg-background border border-white/[0.08] rounded px-2 py-1">
              {formatFramesAsTime(selectedClip.startFrame, fps)}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Duration
            </label>
            <div className="text-sm font-mono bg-background border border-white/[0.08] rounded px-2 py-1">
              {formatFramesAsTime(selectedClip.durationFrames, fps)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Start Frame
            </label>
            <Input
              type="number"
              min={0}
              value={selectedClip.startFrame}
              onChange={(e) =>
                handleClipUpdate({
                  startFrame: Math.max(0, Number(e.target.value)),
                })
              }
              className="w-full bg-background border border-white/[0.08] rounded px-2 py-1 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Duration (frames)
            </label>
            <Input
              type="number"
              min={1}
              value={selectedClip.durationFrames}
              onChange={(e) =>
                handleClipUpdate({
                  durationFrames: Math.max(1, Number(e.target.value)),
                  sourceEndFrame:
                    selectedClip.sourceStartFrame +
                    Math.max(1, Number(e.target.value)),
                })
              }
              className="w-full bg-background border border-white/[0.08] rounded px-2 py-1 text-sm font-mono"
            />
          </div>
        </div>
      </div>

      {/* Volume (for video and audio tracks) */}
      {(selectedTrack.type === EditorTrackType.VIDEO ||
        selectedTrack.type === EditorTrackType.AUDIO) && (
        <div className="space-y-2 border-t border-white/[0.08] pt-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
            Audio
          </h4>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Track Volume: {selectedTrack.volume}%
            </label>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[selectedTrack.volume]}
              onValueChange={([value]) => handleVolumeUpdate(value)}
            />
          </div>

          {selectedClip.volume !== undefined && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Clip Volume: {selectedClip.volume}%
              </label>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[selectedClip.volume]}
                onValueChange={([value]) => handleClipUpdate({ volume: value })}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              withWrapper={false}
              size={ButtonSize.XS}
              variant={ButtonVariant.UNSTYLED}
              className={`flex-1 text-xs px-2 py-1 rounded transition-colors ${
                selectedTrack.isMuted
                  ? 'bg-destructive/20 text-destructive'
                  : 'bg-muted text-foreground/60 hover:bg-muted/80'
              }`}
              onClick={handleToggleMute}
            >
              {selectedTrack.isMuted ? 'Muted' : 'Mute'}
            </Button>
            <Button
              withWrapper={false}
              size={ButtonSize.XS}
              variant={ButtonVariant.UNSTYLED}
              className={`flex-1 text-xs px-2 py-1 rounded transition-colors ${
                selectedTrack.isLocked
                  ? 'bg-warning/20 text-warning'
                  : 'bg-muted text-foreground/60 hover:bg-muted/80'
              }`}
              onClick={handleToggleLock}
            >
              {selectedTrack.isLocked ? 'Locked' : 'Lock'}
            </Button>
          </div>
        </div>
      )}

      {/* Effects summary */}
      {selectedClip.effects.length > 0 && (
        <div className="space-y-2 border-t border-white/[0.08] pt-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
            Effects ({selectedClip.effects.length})
          </h4>
          <div className="space-y-1">
            {selectedClip.effects.map((effect) => (
              <div
                key={effect.type}
                className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1"
              >
                <span className="capitalize">{effect.type}</span>
                <span className="text-muted-foreground">
                  {effect.intensity}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default EditorPropertiesPanel;
