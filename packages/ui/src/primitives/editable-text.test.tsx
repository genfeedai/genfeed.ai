// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditableText } from '@ui/primitives/editable-text';
import { describe, expect, it, vi } from 'vitest';

describe('EditableText', () => {
  it('enters edit mode when clicked', async () => {
    const user = userEvent.setup();
    render(
      <EditableText
        ariaLabel="Edit brand name"
        onSave={vi.fn()}
        value="Acme"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));

    expect(
      screen.getByRole('textbox', { name: 'Edit brand name' }),
    ).toHaveValue('Acme');
  });

  it('commits a trimmed value with Enter', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditableText ariaLabel="Edit brand name" onSave={onSave} value="Acme" />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    const editor = screen.getByRole('textbox', { name: 'Edit brand name' });
    await user.clear(editor);
    await user.type(editor, '  Acme Labs  ');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Acme Labs'));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('reverts with Escape without saving', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditableText ariaLabel="Edit brand name" onSave={onSave} value="Acme" />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    const editor = screen.getByRole('textbox', { name: 'Edit brand name' });
    await user.clear(editor);
    await user.type(editor, 'Changed');
    await user.keyboard('{Escape}');

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Edit brand name' }),
    ).toHaveTextContent('Acme');
  });

  it('commits on blur', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditableText ariaLabel="Edit brand name" onSave={onSave} value="Acme" />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    const editor = screen.getByRole('textbox', { name: 'Edit brand name' });
    await user.clear(editor);
    await user.type(editor, 'Acme Labs');
    await user.tab();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Acme Labs'));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('skips saving an unchanged value', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditableText ariaLabel="Edit brand name" onSave={onSave} value="Acme" />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    await user.keyboard('{Enter}');

    expect(onSave).not.toHaveBeenCalled();
  });

  it('reverts a required empty value without saving', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditableText
        ariaLabel="Edit brand name"
        isRequired
        onSave={onSave}
        value="Acme"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Edit brand name' }));
    await user.keyboard('{Enter}');

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Edit brand name' }),
    ).toHaveTextContent('Acme');
  });

  it('commits multiline text with Command+Enter', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditableText
        ariaLabel="Edit brand description"
        isMultiline
        onSave={onSave}
        value="Original"
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Edit brand description' }),
    );
    const editor = screen.getByRole('textbox', {
      name: 'Edit brand description',
    });
    await user.clear(editor);
    await user.type(editor, 'Updated description');
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('Updated description'),
    );
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('starts editing from the latest parent value after a rerender', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(
      <EditableText ariaLabel="Edit brand name" onSave={onSave} value="Acme" />,
    );

    rerender(
      <EditableText
        ariaLabel="Edit brand name"
        onSave={onSave}
        value="Acme Corp"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));

    expect(
      screen.getByRole('textbox', { name: 'Edit brand name' }),
    ).toHaveValue('Acme Corp');
  });

  it('preserves an in-progress draft when the parent rerenders', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(
      <EditableText ariaLabel="Edit brand name" onSave={onSave} value="Acme" />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    const editor = screen.getByRole('textbox', { name: 'Edit brand name' });
    await user.clear(editor);
    await user.type(editor, 'Acme Labs');

    rerender(
      <EditableText
        ariaLabel="Edit brand name"
        onSave={onSave}
        value="Parent Refresh"
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Edit brand name' }),
    ).toHaveValue('Acme Labs');

    await user.keyboard('{Enter}');

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Acme Labs'));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('shows the saved value after a successful save and parent update', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(
      <EditableText ariaLabel="Edit brand name" onSave={onSave} value="Acme" />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    const editor = screen.getByRole('textbox', { name: 'Edit brand name' });
    await user.clear(editor);
    await user.type(editor, 'Acme Labs');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Acme Labs'));

    rerender(
      <EditableText
        ariaLabel="Edit brand name"
        onSave={onSave}
        value="Acme Labs"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Edit brand name' }),
    ).toHaveTextContent('Acme Labs');
  });

  it('reverts to the captured original when save fails', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('save failed'));
    render(
      <EditableText ariaLabel="Edit brand name" onSave={onSave} value="Acme" />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    const editor = screen.getByRole('textbox', { name: 'Edit brand name' });
    await user.clear(editor);
    await user.type(editor, 'Acme Labs');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Acme Labs'));
    expect(onSave).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: 'Edit brand name' }),
    ).toHaveTextContent('Acme');
  });
});
