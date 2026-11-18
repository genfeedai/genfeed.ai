// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

function Speeds({ onChanges }: { onChanges: string[] }) {
  const [value, setValue] = useState('standard');
  return (
    <RadioGroup
      aria-label="Shipping speed"
      onValueChange={(next) => {
        onChanges.push(next);
        setValue(next);
      }}
      value={value}
    >
      <label>
        <RadioGroupItem value="standard" />
        Standard
      </label>
      <label>
        <RadioGroupItem value="express" />
        Express
      </label>
      <label>
        <RadioGroupItem disabled value="overnight" />
        Overnight
      </label>
    </RadioGroup>
  );
}

describe('RadioGroup', () => {
  it('names the group and checks the current value', () => {
    render(<Speeds onChanges={[]} />);

    expect(
      screen.getByRole('radiogroup', { name: 'Shipping speed' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Express' })).not.toBeChecked();
  });

  it('reports the pressed option', async () => {
    const changes: string[] = [];
    render(<Speeds onChanges={changes} />);

    await userEvent.click(screen.getByText('Express'));

    expect(changes).toEqual(['express']);
    expect(screen.getByRole('radio', { name: 'Express' })).toBeChecked();
  });

  it('does not select a disabled option', async () => {
    const changes: string[] = [];
    render(<Speeds onChanges={changes} />);

    await userEvent.click(screen.getByText('Overnight'));

    expect(changes).toEqual([]);
  });
});
