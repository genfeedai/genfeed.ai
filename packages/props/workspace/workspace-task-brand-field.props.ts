import type { Editor } from '@tiptap/core';

export interface WorkspaceTaskBrandFieldProps {
  editor: Editor | null;
  onClear: () => void;
  selectedTargetBrandLabel: string;
  taskTargetBrandId: string | null;
}
