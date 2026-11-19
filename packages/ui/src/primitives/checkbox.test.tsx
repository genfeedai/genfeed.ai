// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '@ui/primitives/checkbox';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

function ControlledCheckbox({ onChanges }: { onChanges: boolean[] }) {
  const [isOn, setIsOn] = useState(false);
  return (
    <Checkbox
      isChecked={isOn}
      label="Remember me"
      onCheckedChange={(next) => {
        onChanges.push(next === true);
        setIsOn(next === true);
      }}
    />
  );
}

function FormCheckbox({ onSubmit }: { onSubmit: (value: boolean) => void }) {
  const { control, handleSubmit } = useForm<{ terms: boolean }>({
    defaultValues: { terms: false },
  });
  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values.terms))}>
      <Checkbox aria-label="Accept terms" control={control} name="terms" />
      <button type="submit">Save</button>
    </form>
  );
}

describe('Checkbox', () => {
  it('is named by its label and toggles once when the label is clicked', async () => {
    const changes: boolean[] = [];
    render(<ControlledCheckbox onChanges={changes} />);

    expect(
      screen.getByRole('checkbox', { name: 'Remember me' }),
    ).not.toBeChecked();

    await userEvent.click(screen.getByText('Remember me'));

    expect(changes).toEqual([true]);
    expect(screen.getByRole('checkbox', { name: 'Remember me' })).toBeChecked();
  });

  it('reports a partly checked set as mixed', () => {
    render(<Checkbox aria-label="Select all" checked="indeterminate" />);

    expect(
      screen.getByRole('checkbox', { name: 'Select all' }),
    ).toHaveAttribute('aria-checked', 'mixed');
  });

  it('does not change while disabled', async () => {
    const changes: boolean[] = [];
    render(
      <Checkbox
        isDisabled
        label="Locked"
        onCheckedChange={(next) => changes.push(next === true)}
      />,
    );

    await userEvent.click(screen.getByText('Locked'));

    expect(changes).toEqual([]);
  });

  it('writes the checked value to a react-hook-form field', async () => {
    const submitted: boolean[] = [];
    render(<FormCheckbox onSubmit={(value) => submitted.push(value)} />);

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Accept terms' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(submitted).toEqual([true]);
  });
});
