'use client';

import { ButtonSize, ButtonVariant, EditorTrackType } from '@genfeedai/enums';
import type { IEditorTextOverlay, IEditorTrack } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { ColorInput } from '@ui/primitives/color-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface EditorTextPanelProps {
  tracks: IEditorTrack[];
  fps: number;
  totalFrames: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onAddTextTrack: (track: IEditorTrack) => void;
  onTrackUpdate: (trackId: string, updates: Partial<IEditorTrack>) => void;
  onClipSelect: (trackId: string, clipId: string) => void;
}

const DEFAULT_TEXT_OVERLAY: IEditorTextOverlay = {
  backgroundColor: 'transparent',
  color: '#ffffff',
  fontFamily: 'Arial',
  fontSize: 48,
  fontWeight: 700,
  padding: 8,
  position: { x: 50, y: 50 },
  text: 'New Text',
};

const FONT_OPTIONS = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Impact',
  'Comic Sans MS',
];

const PRESET_COLORS = [
  '#ffffff',
  '#000000',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#ff6600',
  '#9933ff',
];

export function EditorTextPanel({
  tracks,
  fps,
  totalFrames,
  selectedTrackId,
  selectedClipId,
  onAddTextTrack,
  onTrackUpdate,
  onClipSelect,
}: EditorTextPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const textTracks = tracks.filter((t) => t.type === EditorTrackType.TEXT);

  const selectedTextClip = (() => {
    if (!selectedTrackId || !selectedClipId) return null;
    const track = textTracks.find((t) => t.id === selectedTrackId);
    if (!track) return null;
    return track.clips.find((c) => c.id === selectedClipId) ?? null;
  })();

  const handleAddTextTrack = useCallback(() => {
    const clipId = uuidv4();
    const trackId = uuidv4();
    const durationFrames = Math.min(fps * 5, totalFrames); // 5 seconds or total duration

    const newTrack: IEditorTrack = {
      clips: [
        {
          durationFrames,
          effects: [],
          id: clipId,
          ingredientId: '',
          ingredientUrl: '',
          sourceEndFrame: durationFrames,
          sourceStartFrame: 0,
          startFrame: 0,
          textOverlay: { ...DEFAULT_TEXT_OVERLAY },
        },
      ],
      id: trackId,
      isLocked: false,
      isMuted: false,
      name: `Text ${textTracks.length + 1}`,
      type: EditorTrackType.TEXT,
      volume: 100,
    };

    onAddTextTrack(newTrack);

    // Auto-select the new text clip
    setTimeout(() => onClipSelect(trackId, clipId), 0);
  }, [fps, totalFrames, textTracks.length, onAddTextTrack, onClipSelect]);

  const handleUpdateTextOverlay = useCallback(
    (updates: Partial<IEditorTextOverlay>) => {
      if (!selectedTrackId || !selectedClipId || !selectedTextClip) return;

      const track = textTracks.find((t) => t.id === selectedTrackId);
      if (!track) return;

      const updatedClips = track.clips.map((clip) => {
        if (clip.id !== selectedClipId) return clip;
        return {
          ...clip,
          textOverlay: {
            ...DEFAULT_TEXT_OVERLAY,
            ...clip.textOverlay,
            ...updates,
          },
        };
      });

      onTrackUpdate(selectedTrackId, { clips: updatedClips });
    },
    [
      selectedTrackId,
      selectedClipId,
      selectedTextClip,
      textTracks,
      onTrackUpdate,
    ],
  );

  const handleDeleteTextTrack = useCallback(
    (trackId: string) => {
      // Mark all clips as empty to effectively remove the track content
      const track = textTracks.find((t) => t.id === trackId);
      if (!track) return;
      onTrackUpdate(trackId, { clips: [] });
    },
    [textTracks, onTrackUpdate],
  );

  return (
    <div className="flex flex-col h-full border-r border-white/[0.08] bg-card">
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
          Text Overlays
        </Button>
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          onClick={handleAddTextTrack}
          tooltip="Add text layer"
        >
          + Add Text
        </Button>
      </div>

      {isExpanded && (
        <div className="flex-1 overflow-y-auto">
          {/* Text layers list */}
          {textTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-muted-foreground">
              <span className="text-xs text-center">
                No text layers yet. Use Add Text to create one.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.08]">
              {textTracks.map((track) =>
                track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    role="button"
                    tabIndex={0}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${
                      selectedClipId === clip.id
                        ? 'bg-primary/10 border-l-2 border-primary'
                        : ''
                    }`}
                    onClick={() => onClipSelect(track.id, clip.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClipSelect(track.id, clip.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium">
                        {clip.textOverlay?.text || 'Empty Text'}
                      </span>
                      <Button
                        withWrapper={false}
                        variant={ButtonVariant.GHOST}
                        size={ButtonSize.XS}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleDeleteTextTrack(track.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-destructive"
                      >
                        Delete
                      </Button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {track.name} · {Math.round(clip.durationFrames / fps)}s
                    </span>
                  </div>
                )),
              )}
            </div>
          )}

          {/* Properties for selected text */}
          {selectedTextClip?.textOverlay && (
            <div className="border-t border-white/[0.08] p-3 space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                Properties
              </h4>

              {/* Text content */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Text
                </label>
                <Textarea
                  value={selectedTextClip.textOverlay.text}
                  onChange={(e) =>
                    handleUpdateTextOverlay({ text: e.target.value })
                  }
                  className="w-full bg-background border border-white/[0.08] rounded px-2 py-1 text-sm resize-none"
                  rows={2}
                />
              </div>

              {/* Font family */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Font
                </label>
                <Select
                  value={selectedTextClip.textOverlay.fontFamily || 'Arial'}
                  onValueChange={(value) =>
                    handleUpdateTextOverlay({ fontFamily: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a font" />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Font size */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Size: {selectedTextClip.textOverlay.fontSize}px
                </label>
                <Slider
                  min={12}
                  max={120}
                  step={1}
                  value={[selectedTextClip.textOverlay.fontSize]}
                  onValueChange={([fontSize]) =>
                    handleUpdateTextOverlay({
                      fontSize,
                    })
                  }
                />
              </div>

              {/* Font weight */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Weight
                </label>
                <Select
                  value={String(selectedTextClip.textOverlay.fontWeight || 700)}
                  onValueChange={(value) =>
                    handleUpdateTextOverlay({
                      fontWeight: Number(value),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a font weight" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="300">Light</SelectItem>
                    <SelectItem value="400">Regular</SelectItem>
                    <SelectItem value="600">Semi-Bold</SelectItem>
                    <SelectItem value="700">Bold</SelectItem>
                    <SelectItem value="900">Black</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Text color */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Color
                </label>
                <div className="flex flex-wrap gap-1">
                  {PRESET_COLORS.map((color) => (
                    <Button
                      withWrapper={false}
                      variant={ButtonVariant.UNSTYLED}
                      size={ButtonSize.XS}
                      key={color}
                      className={`w-6 h-6 rounded border ${
                        selectedTextClip.textOverlay?.color === color
                          ? 'border-primary ring-1 ring-primary'
                          : 'border-white/20'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => handleUpdateTextOverlay({ color })}
                      tooltip={color}
                      ariaLabel={`Set color ${color}`}
                    />
                  ))}
                  <ColorInput
                    value={selectedTextClip.textOverlay.color}
                    onChange={(e) =>
                      handleUpdateTextOverlay({ color: e.target.value })
                    }
                    className="h-6 w-6 rounded border-white/20 p-0"
                    title="Custom color"
                  />
                </div>
              </div>

              {/* Background color */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Background
                </label>
                <div className="flex items-center gap-2">
                  <ColorInput
                    value={
                      selectedTextClip.textOverlay.backgroundColor ===
                      'transparent'
                        ? '#000000'
                        : selectedTextClip.textOverlay.backgroundColor ||
                          '#000000'
                    }
                    onChange={(e) =>
                      handleUpdateTextOverlay({
                        backgroundColor: e.target.value,
                      })
                    }
                    className="h-6 w-8 rounded border-white/20 p-0"
                  />
                  <Button
                    withWrapper={false}
                    variant={ButtonVariant.UNSTYLED}
                    size={ButtonSize.XS}
                    className={`text-xs px-2 py-0.5 rounded ${
                      selectedTextClip.textOverlay.backgroundColor ===
                      'transparent'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                    onClick={() =>
                      handleUpdateTextOverlay({
                        backgroundColor: 'transparent',
                      })
                    }
                  >
                    None
                  </Button>
                </div>
              </div>

              {/* Position X */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  X Position: {selectedTextClip.textOverlay.position.x}%
                </label>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[selectedTextClip.textOverlay.position.x]}
                  onValueChange={([x]) =>
                    handleUpdateTextOverlay({
                      position: {
                        x,
                        y: selectedTextClip.textOverlay?.position?.y ?? 50,
                      },
                    })
                  }
                />
              </div>

              {/* Position Y */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Y Position: {selectedTextClip.textOverlay.position.y}%
                </label>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[selectedTextClip.textOverlay.position.y]}
                  onValueChange={([y]) =>
                    handleUpdateTextOverlay({
                      position: {
                        x: selectedTextClip.textOverlay?.position?.x ?? 50,
                        y,
                      },
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EditorTextPanel;
