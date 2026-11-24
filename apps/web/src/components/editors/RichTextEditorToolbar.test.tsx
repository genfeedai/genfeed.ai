import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import RichTextEditorToolbar from './RichTextEditorToolbar';

/**
 * A minimal editor that keeps a set of active marks, so a spec can read the
 * outcome of a click (which marks are on) rather than which methods ran.
 */
function createEditor(active: string[] = []) {
  const marks = new Set(active);
  const toggle = (name: string) => () => {
    if (marks.has(name)) {
      marks.delete(name);
    } else {
      marks.add(name);
    }
    return { run: () => true };
  };
  const chain = {
    focus: () => chain,
    toggleBold: toggle('bold'),
    toggleItalic: toggle('italic'),
  };
  const editor = {
    chain: () => chain,
    isActive: (name: string) => marks.has(name),
  } as unknown as Editor;
  return { editor, marks };
}

function renderToolbar(editor: Editor) {
  return render(
    <RichTextEditorToolbar
      activeAiAction={null}
      aiConfig={undefined}
      editor={editor}
      handleAiAction={vi.fn()}
      headingValue="0"
      shouldShowAdvancedFormatting={false}
      shouldShowBlockquote={false}
      shouldShowCodeBlock={false}
      shouldShowHeadings={false}
      shouldShowLists={false}
      value=""
    />,
  );
}

describe('RichTextEditorToolbar', () => {
  it('shows which formats are on as pressed toggles', () => {
    const { editor } = createEditor(['bold']);
    renderToolbar(editor);

    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('turns a format on and off from its toggle', async () => {
    const { editor, marks } = createEditor();
    renderToolbar(editor);

    await userEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect([...marks]).toEqual(['italic']);

    await userEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect([...marks]).toEqual([]);
  });
});
