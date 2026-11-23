// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { OptionSelect, type OptionSelectOption } from './option-select';

const PLATFORMS: OptionSelectOption[] = [
  { icon: <svg data-testid="icon-x" />, label: 'X', value: 'x' },
  {
    icon: <svg data-testid="icon-linkedin" />,
    label: 'LinkedIn',
    value: 'linkedin',
  },
];

function Harness({
  options = PLATFORMS,
  isSearchable,
}: {
  isSearchable?: boolean;
  options?: OptionSelectOption[];
}) {
  const [value, setValue] = useState('x');
  return (
    <>
      <OptionSelect
        ariaLabel="Platform"
        isSearchable={isSearchable}
        onValueChange={setValue}
        options={options}
        searchLabel="Search platforms"
        value={value}
      />
      <output aria-label="Chosen">{value}</output>
    </>
  );
}

describe('OptionSelect', () => {
  it('shows the chosen option icon and name in the closed control', () => {
    render(<Harness />);

    const trigger = screen.getByRole('combobox', { name: 'Platform' });
    expect(trigger).toHaveTextContent('X');
    expect(trigger.querySelector('[data-testid="icon-x"]')).not.toBeNull();
  });

  it('shows an icon beside every option and follows the choice', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Platform' }));
    const option = screen.getByRole('option', { name: 'LinkedIn' });
    expect(
      option.querySelector('[data-testid="icon-linkedin"]'),
    ).not.toBeNull();

    await user.click(option);

    expect(screen.getByLabelText('Chosen')).toHaveTextContent('linkedin');
    expect(
      screen
        .getByRole('combobox', { name: 'Platform' })
        .querySelector('[data-testid="icon-linkedin"]'),
    ).not.toBeNull();
  });

  it('filters a searchable list as the person types', async () => {
    const user = userEvent.setup();
    render(<Harness isSearchable />);

    await user.click(screen.getByRole('combobox', { name: 'Platform' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search platforms' }),
      'link',
    );

    expect(screen.getByRole('option', { name: 'LinkedIn' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'X' })).not.toBeInTheDocument();
  });

  it('has no search box for a short list unless asked', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Platform' }));

    expect(
      screen.queryByRole('combobox', { name: 'Search platforms' }),
    ).not.toBeInTheDocument();
  });
});
