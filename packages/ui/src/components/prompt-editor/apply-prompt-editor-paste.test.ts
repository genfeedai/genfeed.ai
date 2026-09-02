import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { applyPromptEditorPasteText } from './apply-prompt-editor-paste';

describe('applyPromptEditorPasteText', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function createEditor(content: string): Editor {
    editor = new Editor({
      content,
      extensions: [StarterKit],
    });
    return editor;
  }

  function paste(instance: Editor, text: string): void {
    instance.view.dispatch(applyPromptEditorPasteText(instance.state, text));
  }

  it('collapses after replacing a highlight so the next paste appends', () => {
    const instance = createEditor('go');
    instance.commands.selectAll();

    paste(instance, 'go');
    paste(instance, 'go');
    paste(instance, 'go');
    paste(instance, 'go');
    paste(instance, 'go');

    expect(instance.getText()).toBe('gogogogogo');
    expect(instance.state.selection.empty).toBe(true);
  });
});
