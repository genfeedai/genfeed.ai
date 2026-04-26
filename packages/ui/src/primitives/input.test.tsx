// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Input } from '@ui/primitives/input';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

function RegisteredInputHarness() {
  const { register } = useForm<{ title: string }>({
    defaultValues: { title: '' },
  });

  return (
    <Input
      {...register('title')}
      isDisabled
      name="title"
      aria-label="Registered title"
      placeholder="Registered title"
    />
  );
}

function ControlledInputHarness() {
  const { control } = useForm<{ title: string }>({
    defaultValues: { title: '' },
  });

  return (
    <Input
      aria-label="Controlled title"
      control={control}
      isDisabled
      name="title"
      placeholder="Controlled title"
    />
  );
}

describe('Input', () => {
  it('does not forward isDisabled to the DOM for registered inputs', () => {
    render(<RegisteredInputHarness />);

    const input = screen.getByRole('textbox', { name: 'Registered title' });

    expect(input).toBeDisabled();
    expect(input).not.toHaveAttribute('isDisabled');
    expect(input.className).toContain('ship-ui');
  });

  it('does not forward isDisabled to the DOM for controlled inputs', () => {
    render(<ControlledInputHarness />);

    const input = screen.getByRole('textbox', { name: 'Controlled title' });

    expect(input).toBeDisabled();
    expect(input).not.toHaveAttribute('isDisabled');
    expect(input.className).toContain('ship-ui');
  });
});
