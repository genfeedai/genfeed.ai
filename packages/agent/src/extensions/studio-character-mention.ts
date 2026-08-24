import { buildMentionSuggestion } from '@genfeedai/agent/components/agent-chat-input.mentions';
import { CharacterMentionList } from '@genfeedai/agent/components/CharacterMentionList';
import { CharacterMention } from '@genfeedai/agent/extensions/character-mention.extension';
import type { CharacterMentionItem } from '@genfeedai/agent/types/mention.types';
import type { AnyExtension, Editor } from '@tiptap/core';

export function createStudioCharacterMentionExtension(
  getMentions: () => readonly CharacterMentionItem[],
): AnyExtension {
  return CharacterMention.configure({
    HTMLAttributes: { class: 'mention mention-character' },
    renderText({ node }) {
      return node.attrs.label ?? node.attrs.handle;
    },
    suggestion: {
      char: '@',
      ...buildMentionSuggestion({
        component: CharacterMentionList,
        getItems: (query) => {
          const needle = query.toLowerCase();
          return getMentions().filter(
            (item) =>
              item.handle.toLowerCase().includes(needle) ||
              item.label.toLowerCase().includes(needle),
          );
        },
      }),
      command: ({
        editor,
        props,
        range,
      }: {
        editor: Editor;
        props: CharacterMentionItem;
        range: { from: number; to: number };
      }) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, {
            attrs: {
              handle: props.handle,
              id: props.id,
              label: props.label,
            },
            type: 'characterMention',
          })
          .run();
      },
    },
  });
}
