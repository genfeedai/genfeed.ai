import { createStudioCharacterMentionExtension } from '@genfeedai/agent/extensions/studio-character-mention';
import { numberReferenceMentions } from '@genfeedai/helpers/content/reference-mention.util';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { createPromptEditorExtensions } from '@ui/prompt-editor/create-prompt-editor-extensions';
import { expect, it } from 'vitest';
import { useStudioReferenceMentions } from '@/features/studio/playground/hooks/useStudioReferenceMentions';

function references(ids: string[]) {
  return numberReferenceMentions(
    ids.map((id) => ({
      id,
      key: id,
      name: id,
      kind: 'image',
      role: 'reference',
      source: 'library',
    })),
  );
}

it('updates live chip labels without rebuilding the editor or taking over character resolution', async () => {
  const characterExtensions = [createStudioCharacterMentionExtension(() => [])];
  const { result, rerender, unmount } = renderHook(
    (ids: string[]) =>
      useStudioReferenceMentions({
        references: references(ids),
        characters: [],
        characterExtensions,
      }),
    { initialProps: ['first', 'second'] },
  );
  const extensions = result.current;
  expect(extensions[0]?.options.suggestion.allow()).toBe(false);
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: createPromptEditorExtensions({ extraExtensions: extensions }),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'referenceMention',
              attrs: { key: 'second', id: 'second', label: '@Image2' },
            },
          ],
        },
      ],
    },
  });
  try {
    await waitFor(() => expect(editor.isInitialized).toBe(true));
    act(() => rerender(['second']));
    expect(result.current).toBe(extensions);
    expect(editor.getText()).toBe('@Image1');
    const chip = editor.getJSON().content?.[0]?.content?.[0];
    expect(chip && 'attrs' in chip ? chip.attrs?.id : undefined).toBe('second');
    act(() => rerender([]));
    expect(editor.getHTML()).toContain('data-missing="true"');
  } finally {
    editor.destroy();
    unmount();
  }
});
