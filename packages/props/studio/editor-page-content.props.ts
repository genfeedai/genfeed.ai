import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import type {
  EditorHistory,
  EditorSaveStatus,
} from '@props/studio/editor-save.props';

export interface EditorPageContentProps {
  projectId: string;
}

export interface EditorState {
  project: IEditorProject | null;
  isLoading: boolean;
  /** Edits the server has not acknowledged yet (queued, in flight or failed). */
  isDirty: boolean;
  saveStatus: EditorSaveStatus;
  history: EditorHistory;
  /** Bumped by every content change; the autosave schedules off it. */
  editVersion: number;
  currentFrame: number;
  isPlaying: boolean;
  isRendering: boolean;
  isDuplicating: boolean;
  hasSaveConflict: boolean;
  zoom: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
}
