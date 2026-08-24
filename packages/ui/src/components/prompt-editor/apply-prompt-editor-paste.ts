import { Fragment, Slice } from '@tiptap/pm/model';
import {
  type EditorState,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state';

function resolvePromptEditorPasteRange(state: EditorState): {
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

export function applyPromptEditorPasteText(
  state: EditorState,
  text: string,
): Transaction {
  const { from, to } = resolvePromptEditorPasteRange(state);
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
