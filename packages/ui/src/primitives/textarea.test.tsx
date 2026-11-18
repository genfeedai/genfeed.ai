// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from '@ui/primitives/textarea';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

function RegisteredTextareaHarness() {
  const { register } = useForm<{ body: string }>({
    defaultValues: { body: '' },
  });

  return (
    <Textarea
      {...register('body')}
      isDisabled
      maxHeight={200}
      name="body"
      aria-label="Registered body"
    />
  );
}

function ControlledTextareaHarness() {
  const { control } = useForm<{ body: string }>({
    defaultValues: { body: '' },
  });

  return (
    <Textarea
      aria-label="Controlled body"
      control={control}
      isDisabled
      maxHeight={200}
      name="body"
    />
  );
}

function EditableControlledTextarea({
  onSave,
}: {
  onSave: (body: string) => void;
}) {
  const { control, handleSubmit } = useForm<{ body: string }>({
    defaultValues: { body: 'Draft' },
  });

  return (
    <form onSubmit={handleSubmit((values) => onSave(values.body))}>
      <Textarea aria-label="Body" control={control} name="body" />
      <button type="submit">Save</button>
    </form>
  );
}

describe('Textarea', () => {
  it('submits the typed text from a controlled textarea', async () => {
    const user = userEvent.setup();
    const saved: string[] = [];
    render(<EditableControlledTextarea onSave={(body) => saved.push(body)} />);

    expect(screen.getByRole('textbox', { name: 'Body' })).toHaveValue('Draft');
    await user.clear(screen.getByRole('textbox', { name: 'Body' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Body' }),
      'Two\nlines',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(saved).toEqual(['Two\nlines']);
  });

  it('does not forward isDisabled to the DOM for registered textareas', () => {
    render(<RegisteredTextareaHarness />);

    const textarea = screen.getByRole('textbox', { name: 'Registered body' });

    expect(textarea).toBeDisabled();
    expect(textarea).not.toHaveAttribute('isDisabled');
    expect(textarea).not.toHaveAttribute('maxHeight');
  });

  it('does not forward isDisabled to the DOM for controlled textareas', () => {
    render(<ControlledTextareaHarness />);

    const textarea = screen.getByRole('textbox', { name: 'Controlled body' });

    expect(textarea).toBeDisabled();
    expect(textarea).not.toHaveAttribute('isDisabled');
    expect(textarea).not.toHaveAttribute('maxHeight');
  });
});
