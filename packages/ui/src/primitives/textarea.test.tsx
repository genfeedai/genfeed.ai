// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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
      name="body"
    />
  );
}

describe('Textarea', () => {
  it('does not forward isDisabled to the DOM for registered textareas', () => {
    render(<RegisteredTextareaHarness />);

    const textarea = screen.getByRole('textbox', { name: 'Registered body' });

    expect(textarea).toBeDisabled();
    expect(textarea).not.toHaveAttribute('isDisabled');
  });

  it('does not forward isDisabled to the DOM for controlled textareas', () => {
    render(<ControlledTextareaHarness />);

    const textarea = screen.getByRole('textbox', { name: 'Controlled body' });

    expect(textarea).toBeDisabled();
    expect(textarea).not.toHaveAttribute('isDisabled');
  });
});
