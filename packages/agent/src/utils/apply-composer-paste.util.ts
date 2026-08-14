import { Fragment, Slice } from '@tiptap/pm/model';
import {
  type EditorState,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state';

function resolveComposerPasteRange(state: EditorState): {
  from: number;
  to: number;
} {
  const { $from, $to } = state.selection;
  if ($from.parent.isTextblock && $to.parent.isTextblock) {
    return { from: $from.pos, to: $to.pos };
  }

  return {
    from: TextSelection.atStart(state.doc).from,
    to: TextSelection.atEnd(state.doc).to,
  };
}

function collapseTransactionToInsertedEnd(tr: Transaction): Transaction {
  const fallback = TextSelection.atEnd(tr.doc);
  const candidate = Math.min(tr.selection.to, fallback.to);
  const $pos = tr.doc.resolve(candidate);
  if ($pos.parent.isTextblock) {
    return tr.setSelection(TextSelection.create(tr.doc, candidate));
  }

  return tr.setSelection(TextSelection.near($pos, -1));
}

/**
 * Insert clipboard text at the current selection. The first paste may replace
 * a highlight; the caret then collapses to the end of the inserted text so
 * the next paste appends — same as a native textarea.
 */
export function applyComposerPasteText(
  state: EditorState,
  text: string,
): Transaction {
  const { from, to } = resolveComposerPasteRange(state);
  const parts = text.split('\n\n');
  const paragraphType = state.schema.nodes.paragraph;

  if (!paragraphType || parts.length === 1) {
    return collapseTransactionToInsertedEnd(
      state.tr.insertText(text, from, to),
    );
  }

  const nodes = parts.map((part) =>
    paragraphType.create(
      null,
      part.length > 0 ? state.schema.text(part) : undefined,
    ),
  );
  const slice = new Slice(Fragment.fromArray(nodes), 0, 0);
  return collapseTransactionToInsertedEnd(
    state.tr.replaceRange(from, to, slice),
  );
}
