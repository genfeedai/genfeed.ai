import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { GenfeedGeneration } from './genfeed-generation.extension';

let editor: Editor | undefined;

function createEditor(content: string): Editor {
  editor = new Editor({
    content,
    element: document.createElement('div'),
    extensions: [StarterKit, GenfeedGeneration],
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

describe('GenfeedGeneration', () => {
  it.each([
    '<figure data-ingredient-id="ing-1" data-genfeed-generation="image"></figure>',
    '<figure data-ingredient-id="ing-2" data-prompt="hidden" data-genfeed-generation="video"></figure>',
  ])('keeps a saved block unchanged: %s', (block) => {
    expect(createEditor(`<p>Intro</p>${block}`).getHTML()).toBe(
      `<p>Intro</p>${block}`,
    );
  });

  it('inserts a block that names the asset', () => {
    const instance = createEditor('<p>Intro</p>');

    instance.commands.insertGenfeedGeneration({
      ingredientId: 'ing-3',
      isPromptShown: false,
      kind: 'image',
    });

    expect(instance.getHTML()).toContain(
      '<figure data-ingredient-id="ing-3" data-prompt="hidden" data-genfeed-generation="image"></figure>',
    );
  });
});
