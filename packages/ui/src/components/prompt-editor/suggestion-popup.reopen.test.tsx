import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import PromptEditorView from '@ui/prompt-editor/PromptEditorView';
import { PromptCommands } from '@ui/prompt-editor/prompt-commands.extension';
import { beforeAll, describe, expect, it } from 'vitest';

const DESCRIPTION = 'Cut out the subject on a clean background';

const COMMANDS: PromptCommand[] = [
  {
    description: DESCRIPTION,
    kind: 'prompt',
    label: 'Remove background',
    name: 'remove-background',
    promptPrefix: 'Remove the background. ',
  },
];

function emptyRect(): DOMRect {
  return new DOMRect();
}

beforeAll(() => {
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => emptyRect();
  }
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () =>
      [emptyRect()] as unknown as DOMRectList;
  }
  if (typeof document.elementFromPoint !== 'function') {
    document.elementFromPoint = () => document.body;
  }
});

describe('suggestion popup', () => {
  // #7494: TipTap builds the renderer once per editor, so a popup that stayed
  // closed after its first exit hid `/` presets until the editor remounted.
  it('opens the `/` palette again after it was closed', async () => {
    const user = userEvent.setup();
    render(
      <PromptEditorView
        extraExtensions={[
          PromptCommands.configure({ getItems: () => COMMANDS }),
        ]}
        value=""
      />,
    );
    const editor = await screen.findByRole('textbox', { name: 'Prompt' });

    await user.click(editor);
    await user.keyboard('/');
    expect(await screen.findByText(DESCRIPTION)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByText(DESCRIPTION)).not.toBeInTheDocument(),
    );

    // jsdom cannot delete text in a contenteditable, so clear through TipTap.
    (editor as HTMLElement & { editor: Editor }).editor.commands.clearContent(
      true,
    );
    await user.keyboard('/');
    expect(await screen.findByText(DESCRIPTION)).toBeInTheDocument();
  });
});
