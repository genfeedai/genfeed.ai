import Mention from '@tiptap/extension-mention';

export const BrandMention = Mention.extend({
  addAttributes() {
    return {
      brandId: { default: null },
      brandName: { default: null },
      brandSlug: { default: null },
    };
  },
  name: 'brandMention',
});
