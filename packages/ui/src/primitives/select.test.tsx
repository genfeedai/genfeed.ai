// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  Select,
  SelectContent,
  SelectField,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './select';

function StatefulSelect({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);

  return (
    <>
      <Select onValueChange={setValue} value={value}>
        <SelectTrigger aria-label="Plan">
          <SelectValue placeholder="Choose a plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">No plan</SelectItem>
          <SelectGroup>
            <SelectLabel>Paid</SelectLabel>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem disabled value="team">
              Team
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <output aria-label="Chosen">{value}</output>
    </>
  );
}

describe('Select', () => {
  it('shows the placeholder while the empty value has no option', () => {
    render(
      <Select value="">
        <SelectTrigger aria-label="Plan">
          <SelectValue placeholder="Choose a plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pro">Pro</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent(
      'Choose a plan',
    );
  });

  it('shows the empty option when the value is empty', async () => {
    render(<StatefulSelect />);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent(
        'No plan',
      ),
    );
  });

  it('shows and reports the option the person chooses', async () => {
    const user = userEvent.setup();
    render(<StatefulSelect />);

    await user.click(screen.getByRole('combobox', { name: 'Plan' }));
    await user.click(await screen.findByRole('option', { name: 'Pro' }));

    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent(
      'Pro',
    );
    expect(screen.getByLabelText('Chosen')).toHaveTextContent('pro');
  });

  it('reports an empty option as an empty string', async () => {
    const user = userEvent.setup();
    render(<StatefulSelect initial="pro" />);

    await user.click(screen.getByRole('combobox', { name: 'Plan' }));
    await user.click(await screen.findByRole('option', { name: 'No plan' }));

    expect(screen.getByLabelText('Chosen')).toHaveTextContent('');
    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent(
      'No plan',
    );
  });

  it('does not let a disabled option be chosen', async () => {
    const user = userEvent.setup();
    render(<StatefulSelect initial="pro" />);

    await user.click(screen.getByRole('combobox', { name: 'Plan' }));
    await user.click(await screen.findByRole('option', { name: 'Team' }));

    expect(screen.getByLabelText('Chosen')).toHaveTextContent('pro');
  });
});

function StatefulField({ changes }: { changes: string[] }) {
  const [value, setValue] = useState('');

  return (
    <SelectField
      label="Brand"
      name="brand"
      onChange={(event) => {
        changes.push(event.target.value);
        setValue(event.target.value);
      }}
      placeholder="Pick a brand"
      value={value}
    >
      <option value="">No brand</option>
      <option value="brand-1">Brand one</option>
    </SelectField>
  );
}

describe('SelectField', () => {
  it('lists the native options and reports the one chosen', async () => {
    const user = userEvent.setup();
    const changes: string[] = [];

    render(<StatefulField changes={changes} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Brand one' }));
    expect(changes).toEqual(['brand-1']);
    expect(screen.getByLabelText('Brand', { selector: 'input' })).toHaveValue(
      'brand-1',
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'No brand' }));
    expect(changes).toEqual(['brand-1', '']);
    expect(screen.getByLabelText('Brand', { selector: 'input' })).toHaveValue(
      '',
    );
  });
});
