import type { EditorInspectorProps } from '@/features/studio/props/editor-inspector.props';
import EditorEffectsPanel from './EditorEffectsPanel';
import EditorPropertiesPanel from './EditorPropertiesPanel';
import EditorTextPanel from './EditorTextPanel';

export default function EditorInspector({
  project,
  isReadOnly,
  selectedTrackId,
  selectedClipId,
  onAddTextTrack,
  onTrackUpdate,
  onClipSelect,
}: EditorInspectorProps) {
  return (
    <div className="flex flex-col" data-testid="editor-inspector">
      <EditorTextPanel
        tracks={project.tracks}
        fps={project.settings.fps}
        totalFrames={project.totalDurationFrames}
        isReadOnly={isReadOnly}
        selectedTrackId={selectedTrackId}
        selectedClipId={selectedClipId}
        onAddTextTrack={onAddTextTrack}
        onTrackUpdate={onTrackUpdate}
        onClipSelect={onClipSelect}
      />
      <EditorEffectsPanel
        tracks={project.tracks}
        isReadOnly={isReadOnly}
        selectedTrackId={selectedTrackId}
        selectedClipId={selectedClipId}
        onTrackUpdate={onTrackUpdate}
      />
      <div className="border-t border-border">
        <EditorPropertiesPanel
          tracks={project.tracks}
          fps={project.settings.fps}
          isReadOnly={isReadOnly}
          selectedTrackId={selectedTrackId}
          selectedClipId={selectedClipId}
          onTrackUpdate={onTrackUpdate}
        />
      </div>
    </div>
  );
}
