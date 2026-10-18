import { fireEvent, screen } from '@testing-library/react';

/** jsdom typing does not reach ProseMirror; the editor's paste handler does. */
export async function typeInPrompt(name: string, text: string): Promise<void> {
  const editor = await screen.findByRole('textbox', { name });
  editor.focus();
  fireEvent.paste(editor, {
    clipboardData: {
      files: [],
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  });
}
