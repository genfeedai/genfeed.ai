// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@ui/primitives/input';
import { useState } from 'react';
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

function EditableControlledInput({
  onSave,
}: {
  onSave: (title: string) => void;
}) {
  const { control, handleSubmit } = useForm<{ title: string }>({
    defaultValues: { title: 'Draft' },
  });

  return (
    <form onSubmit={handleSubmit((values) => onSave(values.title))}>
      <Input aria-label="Title" control={control} name="title" />
      <button type="submit">Save</button>
    </form>
  );
}

function StatefulInput() {
  const [name, setName] = useState('Ada');

  return (
    <>
      <Input
        aria-label="Name"
        onChange={(event) => setName(event.target.value)}
        value={name}
      />
      <output>{name}</output>
    </>
  );
}

describe('Input', () => {
  it('shows what a person types in a state-controlled input', async () => {
    const user = userEvent.setup();
    render(<StatefulInput />);

    await user.type(screen.getByRole('textbox', { name: 'Name' }), ' Lovelace');

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Ada Lovelace',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Ada Lovelace');
  });

  it('submits the typed text from a controlled input', async () => {
    const user = userEvent.setup();
    const saved: string[] = [];
    render(<EditableControlledInput onSave={(title) => saved.push(title)} />);

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Draft');
    await user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Launch');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(saved).toEqual(['Launch']);
  });

  it('keeps a checkbox input checkable', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Agree" type="checkbox" />);

    await user.click(screen.getByRole('checkbox', { name: 'Agree' }));

    expect(screen.getByRole('checkbox', { name: 'Agree' })).toBeChecked();
  });

  it('does not forward isDisabled to the DOM for registered inputs', () => {
    render(<RegisteredInputHarness />);

    const input = screen.getByRole('textbox', { name: 'Registered title' });

    expect(input).toBeDisabled();
    expect(input).not.toHaveAttribute('isDisabled');
    expect(input.className).toContain('bg-tertiary');
  });

  it('does not forward isDisabled to the DOM for controlled inputs', () => {
    render(<ControlledInputHarness />);

    const input = screen.getByRole('textbox', { name: 'Controlled title' });

    expect(input).toBeDisabled();
    expect(input).not.toHaveAttribute('isDisabled');
    expect(input.className).toContain('bg-tertiary');
  });
});
