import type { AnyExtension } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import type { EditorView } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { applyPromptEditorPasteText } from '@ui/prompt-editor/apply-prompt-editor-paste';
import { normalizePromptEditorPasteText } from '@ui/prompt-editor/normalize-prompt-editor-paste';
import { SendOnEnter } from '@ui/prompt-editor/send-on-enter.extension';

export interface CreatePromptEditorExtensionsOptions {
  extraExtensions?: readonly AnyExtension[];
  onEnter?: () => boolean;
  placeholder?: string;
}

export function createPromptEditorPasteHandler() {
  return (view: EditorView, event: ClipboardEvent): boolean => {
    const clipboard = event.clipboardData;
    if (!clipboard) {
      return false;
    }

    const hasFiles = Array.from(clipboard.files ?? []).some(
      (file) =>
        file.type.startsWith('image/') ||
        file.type.startsWith('video/') ||
        file.type.startsWith('audio/'),
    );
    if (hasFiles) {
      event.preventDefault();
      return true;
    }

    const plain = clipboard.getData('text/plain');
    if (!plain) {
      return false;
    }

    const normalized = normalizePromptEditorPasteText(plain);
    event.preventDefault();
    if (!normalized) {
      return true;
    }

    const { state, dispatch } = view;
    dispatch(applyPromptEditorPasteText(state, normalized));
    return true;
  };
}

export function createPromptEditorExtensions({
  extraExtensions = [],
  onEnter,
  placeholder = '',
}: CreatePromptEditorExtensionsOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      listItem: false,
      orderedList: false,
    }),
    Placeholder.configure({
      placeholder: () => placeholder,
    }),
    SendOnEnter.configure({
      onEnter: () => onEnter?.() ?? false,
    }),
    ...extraExtensions,
  ];
}
