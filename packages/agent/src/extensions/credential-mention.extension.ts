import Mention from '@tiptap/extension-mention';

export const CredentialMention = Mention.extend({
  addAttributes() {
    return {
      handle: { default: null },
      id: { default: null },
      platform: { default: null },
    };
  },
  name: 'credentialMention',
});
