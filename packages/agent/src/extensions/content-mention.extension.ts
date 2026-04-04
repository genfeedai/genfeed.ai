import Mention from '@tiptap/extension-mention';

export const ContentMention = Mention.extend({
  addAttributes() {
    return {
      contentId: { default: null },
      contentTitle: { default: null },
      contentType: { default: null },
    };
  },
  name: 'contentMention',
});
