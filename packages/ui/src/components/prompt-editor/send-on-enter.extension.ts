import { Extension } from '@tiptap/core';

export interface SendOnEnterOptions {
  onEnter: () => boolean;
}

export const SendOnEnter = Extension.create<SendOnEnterOptions>({
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (editor.view.composing) {
          return false;
        }
        return this.options.onEnter();
      },
    };
  },
  addOptions() {
    return {
      onEnter: () => false,
    };
  },
  name: 'sendOnEnter',
});
