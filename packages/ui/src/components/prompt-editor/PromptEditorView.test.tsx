import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PromptEditorView from '@ui/prompt-editor/PromptEditorView';
import { beforeAll, describe, expect, it, vi } from 'vitest';

function emptyRect(): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    toJSON() {
      return this;
    },
    top: 0,
    width: 0,
    x: 0,
    y: 0,
  };
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

describe('PromptEditorView', () => {
  it('serializes typed content to plain text', async () => {
    const onValueChange = vi.fn();

    render(<PromptEditorView onValueChange={onValueChange} value="" />);
    const editor = await screen.findByRole('textbox', { name: 'Prompt' });
    editor.focus();

    // jsdom user typing does not emit ProseMirror updates; the shipped paste
    // handler is the reliable insert path in CI.
    fireEvent.paste(editor, {
      clipboardData: {
        files: [],
        getData: (type: string) => (type === 'text/plain' ? 'hello world' : ''),
      },
    });

    await waitFor(() => {
      expect(onValueChange).toHaveBeenCalled();
      const last = onValueChange.mock.calls.at(-1)?.[0];
      expect(last).toContain('hello world');
    });
  });

  it('applies an external form write without duplicating content', async () => {
    const { rerender } = render(<PromptEditorView value="first" />);
    const editor = await screen.findByRole('textbox', { name: 'Prompt' });

    rerender(<PromptEditorView value="enhanced prompt" />);

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
      <PromptEditorView
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
    render(<PromptEditorView isDisabled value="locked" />);
    const editor = await screen.findByRole('textbox', { name: 'Prompt' });
    expect(editor).toHaveAttribute('contenteditable', 'false');
  });

  it('pastes plain text only', async () => {
    const onValueChange = vi.fn();
    render(<PromptEditorView onValueChange={onValueChange} value="" />);
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
