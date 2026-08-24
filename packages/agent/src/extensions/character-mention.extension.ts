import Mention from '@tiptap/extension-mention';

export const CharacterMention = Mention.extend({
  addAttributes() {
    return {
      handle: { default: null },
      id: { default: null },
      label: { default: null },
    };
  },
  name: 'characterMention',
});
