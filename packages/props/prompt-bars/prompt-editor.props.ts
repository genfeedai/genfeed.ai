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
  /** Puts the caret at the end once the editor mounts (dialogs that open on the prompt). */
  isAutoFocused?: boolean;
  isDisabled?: boolean;
  onDocumentChange?: (document: JSONContent) => void;
  onSubmit?: () => void;
  onValueChange?: (plainText: string) => void;
  placeholder?: string;
  testId?: string;
  value?: string;
}
