import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import GenfeedGenerationNodeView from '../GenfeedGenerationNodeView';

export type GenfeedGenerationKind = 'image' | 'video';

export interface GenfeedGenerationAttributes {
  ingredientId: string;
  isPromptShown: boolean;
  kind: GenfeedGenerationKind;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    genfeedGeneration: {
      /** Inserts a Genfeed generation block at the cursor. */
      insertGenfeedGeneration: (
        attributes: GenfeedGenerationAttributes,
      ) => ReturnType;
    };
  }
}

/**
 * A Genfeed generation embedded in an article (#9663). It is stored as an
 * empty `<figure>` that names the asset and whether its prompt is shown; the
 * public article page resolves it into the output, the model, the prompt and
 * a "Recreate in Genfeed" link.
 */
export const GenfeedGeneration = Node.create({
  addAttributes() {
    return {
      ingredientId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-ingredient-id'),
        renderHTML: (attributes) => ({
          'data-ingredient-id': attributes.ingredientId,
        }),
      },
      isPromptShown: {
        default: true,
        parseHTML: (element) =>
          element.getAttribute('data-prompt') !== 'hidden',
        renderHTML: (attributes) =>
          attributes.isPromptShown ? {} : { 'data-prompt': 'hidden' },
      },
      kind: {
        default: 'image',
        parseHTML: (element) =>
          element.getAttribute('data-genfeed-generation') === 'video'
            ? 'video'
            : 'image',
        renderHTML: (attributes) => ({
          'data-genfeed-generation': attributes.kind,
        }),
      },
    };
  },

  addCommands() {
    return {
      insertGenfeedGeneration:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({ attrs: attributes, type: this.name }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(GenfeedGenerationNodeView);
  },

  atom: true,
  draggable: true,
  group: 'block',
  name: 'genfeedGeneration',

  parseHTML() {
    return [{ tag: 'figure[data-genfeed-generation]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes)];
  },
});
