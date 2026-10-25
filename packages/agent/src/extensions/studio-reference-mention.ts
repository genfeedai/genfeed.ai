import StudioReferenceMentionList from '@genfeedai/agent/components/StudioReferenceMentionList';
import type { StudioReferenceMention as StudioReferenceMentionItem } from '@genfeedai/contracts/interfaces/studio/studio-reference-mention.interface';
import { findReferenceMentionTokens } from '@genfeedai/helpers/content/reference-mention.util';
import type {
  StudioMentionSuggestion,
  StudioReferenceMentionOptions,
} from '@genfeedai/props/studio/studio-reference-mention.props';
import { mergeAttributes, Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createSuggestionPopupRenderer } from '@ui/prompt-editor/suggestion-popup.util';

export const STUDIO_REFERENCES_CHANGED = 'studioReferencesChanged';

/** One @ menu owns both kinds. Positional handles are reserved for explicit
 * attachments; ordinary character handles keep their existing node/resolver.
 */
export function studioMentionSuggestions(
  options: StudioReferenceMentionOptions,
  query: string,
): StudioMentionSuggestion[] {
  const needle = query.toLowerCase();
  const references: StudioMentionSuggestion[] = options
    .getReferences()
    .filter((item) =>
      `${item.token.slice(1)} ${item.name} ${item.role}`
        .toLowerCase()
        .includes(needle),
    )
    .map((reference) => ({ kind: 'reference', reference }));
  const characters: StudioMentionSuggestion[] = options
    .getCharacters()
    .filter((item) => !/^(Image|Video|Audio)\d+$/.test(item.handle))
    .filter((item) =>
      `${item.handle} ${item.label}`.toLowerCase().includes(needle),
    )
    .map((character) => ({ kind: 'character', character }));
  return [...references, ...characters];
}

export const StudioReferenceMention =
  Node.create<StudioReferenceMentionOptions>({
    name: 'referenceMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    addOptions() {
      return { getCharacters: () => [], getReferences: () => [] };
    },
    addAttributes() {
      return {
        id: { default: null },
        key: { default: null },
        label: { default: '' },
        isMissing: { default: false, rendered: false },
      };
    },
    parseHTML() {
      return [{ tag: 'span[data-type="referenceMention"]' }];
    },
    renderHTML({ node, HTMLAttributes }) {
      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          'data-type': this.name,
          'data-missing': node.attrs.isMissing ? 'true' : undefined,
          class: `mention mention-reference${node.attrs.isMissing ? ' text-destructive' : ''}`,
        }),
        node.attrs.label,
      ];
    },
    renderText({ node }) {
      return node.attrs.label;
    },
    onCreate() {
      this.options.onCreate?.(this.editor);
      this.editor.view.dispatch(
        this.editor.state.tr.setMeta(STUDIO_REFERENCES_CHANGED, true),
      );
    },
    addProseMirrorPlugins() {
      const options = this.options;
      return [
        Suggestion<StudioMentionSuggestion>({
          editor: this.editor,
          char: '@',
          pluginKey: new PluginKey('studioReferenceSuggestion'),
          items: ({ query }) => studioMentionSuggestions(options, query),
          render: () =>
            createSuggestionPopupRenderer(StudioReferenceMentionList),
          command: ({ editor, range, props }) => {
            const content =
              props.kind === 'reference'
                ? {
                    type: 'referenceMention',
                    attrs: {
                      id: props.reference.id,
                      key: props.reference.key,
                      label: props.reference.token,
                    },
                  }
                : {
                    type: 'characterMention',
                    attrs: {
                      id: props.character.id,
                      handle: props.character.handle,
                      label: props.character.label,
                    },
                  };
            editor
              .chain()
              .focus()
              .insertContentAt(range, [content, { type: 'text', text: ' ' }])
              .run();
          },
        }),
        new Plugin({
          key: new PluginKey('studioReferenceIdentity'),
          appendTransaction(transactions, _oldState, state) {
            if (
              !transactions.some(
                (transaction) =>
                  transaction.docChanged ||
                  transaction.getMeta(STUDIO_REFERENCES_CHANGED),
              )
            )
              return null;
            const references = new Map<string, StudioReferenceMentionItem>(
              options
                .getReferences()
                .map((reference) => [reference.key, reference]),
            );
            const byToken = new Map(
              options
                .getReferences()
                .map((reference) => [reference.token, reference]),
            );
            const shouldHydrateTokens = transactions.some(
              (transaction) =>
                transaction.getMeta('preventUpdate') !== undefined ||
                transaction.getMeta('uiEvent') === 'paste' ||
                transaction.getMeta(STUDIO_REFERENCES_CHANGED),
            );
            const transaction = state.tr;
            state.doc.descendants((node, position) => {
              if (node.isText && node.text) {
                for (const match of findReferenceMentionTokens(node.text)) {
                  const reference = byToken.get(match[0]);
                  if (!reference || match.index === undefined) continue;
                  const from = position + match.index;
                  const to = from + match[0].length;
                  // Leave the active token editable until its delimiter, so
                  // typing @Image12 cannot prematurely turn @Image1 into a chip.
                  if (!shouldHydrateTokens && state.selection.from === to)
                    continue;
                  const type = state.schema.nodes.referenceMention;
                  if (!type) continue;
                  transaction.replaceWith(
                    transaction.mapping.map(from),
                    transaction.mapping.map(to),
                    type.create(
                      {
                        id: reference.id,
                        key: reference.key,
                        label: reference.token,
                      },
                      null,
                      node.marks,
                    ),
                  );
                }
                return;
              }
              if (node.type.name !== 'referenceMention') return;
              const reference = references.get(node.attrs.key);
              const isMissing = !reference || reference.id !== node.attrs.id;
              // Zero is never a valid slot. Persisting a removed chip as an
              // invalid token also prevents rebinding after a plain-text draft reload.
              const label = isMissing
                ? String(node.attrs.label).replace(/\d+$/, '0')
                : reference.token;
              if (
                label !== node.attrs.label ||
                isMissing !== node.attrs.isMissing
              )
                transaction.setNodeMarkup(
                  transaction.mapping.map(position),
                  undefined,
                  {
                    ...node.attrs,
                    isMissing,
                    label,
                  },
                );
            });
            return transaction.docChanged
              ? transaction.setMeta('addToHistory', false)
              : null;
          },
        }),
      ];
    },
  });
