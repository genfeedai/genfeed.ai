import Mention from '@tiptap/extension-mention';

export const TeamMention = Mention.extend({
  addAttributes() {
    return {
      displayName: { default: null },
      isAgent: { default: false },
      role: { default: null },
      userId: { default: null },
    };
  },
  name: 'teamMention',
});
