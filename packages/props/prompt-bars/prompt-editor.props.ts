import type { AnyExtension, Editor, JSONContent } from '@tiptap/core';

/** One-shot rich prompt. A new `id` replaces the editor document. */
export interface PromptEditorDocumentSeed {
  content: JSONContent;
  id: string;
}

export interface PromptEditorProps {
  ariaLabel?: string;
  className?: string;
  documentSeed?: PromptEditorDocumentSeed | null;
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
