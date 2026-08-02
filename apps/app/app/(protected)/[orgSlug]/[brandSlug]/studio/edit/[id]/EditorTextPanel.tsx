'use client';

import { EditorTrackType } from '@genfeedai/enums';
import type { IEditorTextOverlay, IEditorTrack } from '@genfeedai/interfaces';
import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import EditorTextPanelHeader from './EditorTextPanelHeader';
import EditorTextProperties from './EditorTextProperties';
import EditorTextTrackList from './EditorTextTrackList';

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

function EditorTextPanel({
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
      <EditorTextPanelHeader
        isExpanded={isExpanded}
        onToggleExpanded={() => setIsExpanded(!isExpanded)}
        onAddText={handleAddTextTrack}
      />

      {isExpanded && (
        <div className="flex-1 overflow-y-auto">
          <EditorTextTrackList
            textTracks={textTracks}
            fps={fps}
            selectedClipId={selectedClipId}
            onClipSelect={onClipSelect}
            onDeleteTrack={handleDeleteTextTrack}
          />

          {selectedTextClip?.textOverlay && (
            <EditorTextProperties
              selectedTextClip={selectedTextClip}
              onUpdateTextOverlay={handleUpdateTextOverlay}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default EditorTextPanel;
