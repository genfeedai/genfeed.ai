import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyComposerDocument,
  areComposerDocumentsEqual,
} from './apply-composer-document.util';

describe('areComposerDocumentsEqual', () => {
  it('treats an empty string as an empty paragraph doc', () => {
    expect(
      areComposerDocumentsEqual(
        { content: [{ type: 'paragraph' }], type: 'doc' },
        '',
      ),
    ).toBe(true);
  });

  it('compares JSON documents by value', () => {
    const document = {
      content: [
        {
          content: [{ text: 'hello', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };

    expect(areComposerDocumentsEqual(document, document)).toBe(true);
    expect(
      areComposerDocumentsEqual(document, {
        ...document,
        content: [
          {
            content: [{ text: 'hello world', type: 'text' }],
            type: 'paragraph',
          },
        ],
      }),
    ).toBe(false);
  });
});

describe('applyComposerDocument', () => {
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

  it('collapses a full-document selection so a later insert appends', () => {
    const instance = createEditor('k fldsjf slkdj slkdj f');
    instance.commands.selectAll();

    expect(instance.state.selection.empty).toBe(false);

    applyComposerDocument(instance, instance.getJSON());

    expect(instance.state.selection.empty).toBe(true);
    expect(instance.state.selection.from).toBe(instance.state.selection.to);

    instance.commands.insertContent(' extra');
    expect(instance.getText()).toBe('k fldsjf slkdj slkdj f extra');
  });

  it('replaces differing content and leaves a caret at the end', () => {
    const instance = createEditor('old draft');

    applyComposerDocument(instance, 'restored draft');

    expect(instance.getText()).toBe('restored draft');
    expect(instance.state.selection.empty).toBe(true);
    expect(instance.state.selection.from).toBe(
      TextSelection.atEnd(instance.state.doc).to,
    );
  });
});
