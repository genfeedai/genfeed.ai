import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { describe, expect, it, vi } from 'vitest';

describe('PromptEditor', () => {
  it('serializes typed content to plain text', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(<PromptEditor onValueChange={onValueChange} value="" />);

    const editor = await screen.findByRole('textbox', { name: 'Prompt' });
    await user.click(editor);
    await user.type(editor, 'hello world');

    await waitFor(() => {
      expect(onValueChange).toHaveBeenCalled();
      const last = onValueChange.mock.calls.at(-1)?.[0];
      expect(last).toContain('hello world');
    });
  });

  it('applies an external form write without duplicating content', async () => {
    const { rerender } = render(<PromptEditor value="first" />);
    const editor = await screen.findByRole('textbox', { name: 'Prompt' });

    rerender(<PromptEditor value="enhanced prompt" />);

    await waitFor(() => {
      expect(editor).toHaveTextContent('enhanced prompt');
      expect(editor).not.toHaveTextContent('first enhanced prompt');
    });
  });

  it('submits on Enter and inserts a newline on Shift+Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onValueChange = vi.fn();

    render(
      <PromptEditor
        onSubmit={onSubmit}
        onValueChange={onValueChange}
        value=""
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Prompt' });
    await user.click(editor);
    await user.keyboard('line{Shift>}{Enter}{/Shift}');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalled();
  });

  it('propagates disabled as a read-only editor', async () => {
    render(<PromptEditor isDisabled value="locked" />);
    const editor = await screen.findByRole('textbox', { name: 'Prompt' });
    expect(editor).toHaveAttribute('contenteditable', 'false');
  });

  it('pastes plain text only', async () => {
    const onValueChange = vi.fn();
    render(<PromptEditor onValueChange={onValueChange} value="" />);
    const editor = await screen.findByRole('textbox', { name: 'Prompt' });
    editor.focus();

    fireEvent.paste(editor, {
      clipboardData: {
        files: [],
        getData: (type: string) =>
          type === 'text/plain' ? 'pasted plain' : '<b>html</b>',
      },
    });

    await waitFor(() => {
      const last = onValueChange.mock.calls.at(-1)?.[0] as string | undefined;
      expect(last ?? '').toContain('pasted plain');
      expect(last ?? '').not.toContain('<b>');
    });
  });
});
