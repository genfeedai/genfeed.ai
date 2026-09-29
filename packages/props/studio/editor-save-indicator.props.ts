import type { EditorSaveStatus } from '@props/studio/editor-save.props';

export interface EditorSaveIndicatorProps {
  isDirty: boolean;
  saveStatus: EditorSaveStatus;
}
