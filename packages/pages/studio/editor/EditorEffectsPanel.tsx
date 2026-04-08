'use client';

import {
  ButtonSize,
  ButtonVariant,
  EditorEffectType,
  EditorTrackType,
} from '@genfeedai/enums';
import type { IEditorEffect, IEditorTrack } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { Slider } from '@ui/primitives/slider';
import { useCallback, useState } from 'react';

interface EditorEffectsPanelProps {
  tracks: IEditorTrack[];
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onTrackUpdate: (trackId: string, updates: Partial<IEditorTrack>) => void;
}

interface EffectConfig {
  type: EditorEffectType;
  label: string;
  description: string;
  defaultIntensity: number;
}

const AVAILABLE_EFFECTS: EffectConfig[] = [
  {
    defaultIntensity: 50,
    description: 'Apply gaussian blur',
    label: 'Blur',
    type: EditorEffectType.BLUR,
  },
  {
    defaultIntensity: 50,
    description: 'Adjust brightness level',
    label: 'Brightness',
    type: EditorEffectType.BRIGHTNESS,
  },
  {
    defaultIntensity: 50,
    description: 'Adjust contrast level',
    label: 'Contrast',
    type: EditorEffectType.CONTRAST,
  },
  {
    defaultIntensity: 50,
    description: 'Adjust color saturation',
    label: 'Saturation',
    type: EditorEffectType.SATURATION,
  },
  {
    defaultIntensity: 100,
    description: 'Convert to grayscale',
    label: 'Grayscale',
    type: EditorEffectType.GRAYSCALE,
  },
  {
    defaultIntensity: 100,
    description: 'Apply sepia tone',
    label: 'Sepia',
    type: EditorEffectType.SEPIA,
  },
];

export function EditorEffectsPanel({
  tracks,
  selectedTrackId,
  selectedClipId,
  onTrackUpdate,
}: EditorEffectsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Find the selected clip (from video or audio tracks — effects apply to video)
  const selectedClip = (() => {
    if (!selectedTrackId || !selectedClipId) return null;
    const track = tracks.find((t) => t.id === selectedTrackId);
    if (!track) return null;
    return track.clips.find((c) => c.id === selectedClipId) ?? null;
  })();

  const selectedTrack = selectedTrackId
    ? tracks.find((t) => t.id === selectedTrackId)
    : null;

  const isVideoTrack = selectedTrack?.type === EditorTrackType.VIDEO;

  const handleAddEffect = useCallback(
    (effectType: EditorEffectType, defaultIntensity: number) => {
      if (!selectedTrackId || !selectedClipId || !selectedClip) return;

      // Check if effect already applied
      if (selectedClip.effects.some((e) => e.type === effectType)) return;

      const track = tracks.find((t) => t.id === selectedTrackId);
      if (!track) return;

      const newEffect: IEditorEffect = {
        intensity: defaultIntensity,
        type: effectType,
      };

      const updatedClips = track.clips.map((clip) => {
        if (clip.id !== selectedClipId) return clip;
        return {
          ...clip,
          effects: [...clip.effects, newEffect],
        };
      });

      onTrackUpdate(selectedTrackId, { clips: updatedClips });
    },
    [selectedTrackId, selectedClipId, selectedClip, tracks, onTrackUpdate],
  );

  const handleUpdateEffect = useCallback(
    (effectType: EditorEffectType, intensity: number) => {
      if (!selectedTrackId || !selectedClipId) return;

      const track = tracks.find((t) => t.id === selectedTrackId);
      if (!track) return;

      const updatedClips = track.clips.map((clip) => {
        if (clip.id !== selectedClipId) return clip;
        return {
          ...clip,
          effects: clip.effects.map((e) =>
            e.type === effectType ? { ...e, intensity } : e,
          ),
        };
      });

      onTrackUpdate(selectedTrackId, { clips: updatedClips });
    },
    [selectedTrackId, selectedClipId, tracks, onTrackUpdate],
  );

  const handleRemoveEffect = useCallback(
    (effectType: EditorEffectType) => {
      if (!selectedTrackId || !selectedClipId) return;

      const track = tracks.find((t) => t.id === selectedTrackId);
      if (!track) return;

      const updatedClips = track.clips.map((clip) => {
        if (clip.id !== selectedClipId) return clip;
        return {
          ...clip,
          effects: clip.effects.filter((e) => e.type !== effectType),
        };
      });

      onTrackUpdate(selectedTrackId, { clips: updatedClips });
    },
    [selectedTrackId, selectedClipId, tracks, onTrackUpdate],
  );

  const appliedEffects = selectedClip?.effects ?? [];

  return (
    <div className="flex flex-col h-full border-l border-white/[0.08] bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08]">
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          size={ButtonSize.SM}
          className="flex items-center gap-1 text-sm font-medium"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span
            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          >
            ▸
          </span>
          Effects
        </Button>
      </div>

      {isExpanded && (
        <div className="flex-1 overflow-y-auto">
          {!selectedClip ? (
            <div className="flex flex-col items-center justify-center p-6 text-muted-foreground">
              <span className="text-xs text-center">
                Select a clip on the timeline to apply effects.
              </span>
            </div>
          ) : !isVideoTrack ? (
            <div className="flex flex-col items-center justify-center p-6 text-muted-foreground">
              <span className="text-xs text-center">
                Effects can only be applied to video clips.
              </span>
            </div>
          ) : (
            <>
              {/* Applied effects */}
              {appliedEffects.length > 0 && (
                <div className="p-3 border-b border-white/[0.08]">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    Applied ({appliedEffects.length})
                  </h4>
                  <div className="space-y-3">
                    {appliedEffects.map((effect) => {
                      const config = AVAILABLE_EFFECTS.find(
                        (e) => e.type === effect.type,
                      );
                      if (!config) return null;
                      return (
                        <div
                          key={effect.type}
                          className="bg-muted/50 rounded p-2"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">
                              {config.label}
                            </span>
                            <Button
                              withWrapper={false}
                              variant={ButtonVariant.GHOST}
                              size={ButtonSize.XS}
                              onClick={() => handleRemoveEffect(effect.type)}
                              className="text-destructive hover:text-destructive"
                            >
                              ✕
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Slider
                              min={0}
                              max={100}
                              step={1}
                              value={[effect.intensity]}
                              onValueChange={([intensity]) =>
                                handleUpdateEffect(effect.type, intensity)
                              }
                              className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-8 text-right">
                              {effect.intensity}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Available effects */}
              <div className="p-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                  Available Effects
                </h4>
                <div className="space-y-1">
                  {AVAILABLE_EFFECTS.filter(
                    (config) =>
                      !appliedEffects.some((e) => e.type === config.type),
                  ).map((config) => (
                    <Button
                      withWrapper={false}
                      variant={ButtonVariant.UNSTYLED}
                      size={ButtonSize.SM}
                      key={config.type}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-muted/50 transition-colors text-left"
                      onClick={() =>
                        handleAddEffect(config.type, config.defaultIntensity)
                      }
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium block">
                          {config.label}
                        </span>
                        <span className="text-xs text-muted-foreground block truncate">
                          {config.description}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">+</span>
                    </Button>
                  ))}
                  {AVAILABLE_EFFECTS.every((config) =>
                    appliedEffects.some((e) => e.type === config.type),
                  ) && (
                    <div className="text-xs text-muted-foreground text-center py-2">
                      All effects applied
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default EditorEffectsPanel;
