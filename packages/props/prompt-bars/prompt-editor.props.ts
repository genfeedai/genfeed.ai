import type { AnyExtension, Editor, JSONContent } from '@tiptap/core';

export interface PromptEditorProps {
  ariaLabel?: string;
  className?: string;
  editor?: Editor | null;
  editorClassName?: string;
  extraExtensions?: readonly AnyExtension[];
  initialContent?: JSONContent | string;
  isDisabled?: boolean;
  onDocumentChange?: (document: JSONContent) => void;
  onSubmit?: () => void;
  onValueChange?: (plainText: string) => void;
  placeholder?: string;
  testId?: string;
  value?: string;
}
