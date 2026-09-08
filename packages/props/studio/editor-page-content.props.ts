import type { IEditorProject } from '@genfeedai/contracts/interfaces';

export interface EditorPageContentProps {
  projectId: string;
}

export interface EditorState {
  project: IEditorProject | null;
  isLoading: boolean;
  isDirty: boolean;
  lastSavedAt: Date | null;
  currentFrame: number;
  isPlaying: boolean;
  isRendering: boolean;
  zoom: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
}
