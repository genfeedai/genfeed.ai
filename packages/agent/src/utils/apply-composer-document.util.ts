import type { Editor, JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

function isEmptyComposerDocument(document: JSONContent): boolean {
  const content = document.content;
  if (!content || content.length === 0) {
    return true;
  }

  if (content.length !== 1) {
    return false;
  }

  const only = content[0];
  return (
    only?.type === 'paragraph' &&
    (only.content === undefined || only.content.length === 0)
  );
}

export function areComposerDocumentsEqual(
  current: JSONContent,
  next: JSONContent | string,
): boolean {
  if (typeof next === 'string') {
    return next.length === 0 && isEmptyComposerDocument(current);
  }

  return JSON.stringify(current) === JSON.stringify(next);
}

export function collapseComposerSelectionToEnd(editor: Editor): void {
  const selection = TextSelection.atEnd(editor.state.doc);
  if (
    editor.state.selection.from === selection.from &&
    editor.state.selection.to === selection.to
  ) {
    return;
  }

  editor.commands.setTextSelection({
    from: selection.from,
    to: selection.to,
  });
}

/**
 * Load a restored composer document without leaving the whole prompt selected.
 * TipTap `setContent` replaces the doc (`replaceWith(0, size, …)`), which maps
 * to a full-document selection — paste then overwrites instead of appending.
 */
export function applyComposerDocument(
  editor: Editor,
  content: JSONContent | string,
): void {
  if (!areComposerDocumentsEqual(editor.getJSON(), content)) {
    editor.commands.setContent(content, { emitUpdate: false });
  }

  collapseComposerSelectionToEnd(editor);
}
