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

function NoneHarness() {
  const [value, setValue] = useState('a');
  return (
    <>
      <OptionSelect
        ariaLabel="Folder"
        onValueChange={setValue}
        options={[
          { label: 'No folder', value: '' },
          { label: 'Archive', value: 'a' },
        ]}
        value={value}
      />
      <output aria-label="Chosen">{value === '' ? 'empty' : value}</output>
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
  it('shows the control icon when the chosen option has none of its own', () => {
    render(
      <OptionSelect
        ariaLabel="Duration"
        icon={<svg data-testid="icon-clock" />}
        onValueChange={() => {}}
        options={[{ label: '5s', value: '5' }]}
        value="5"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Duration' });
    expect(trigger).toHaveTextContent('5s');
    expect(trigger.querySelector('[data-testid="icon-clock"]')).not.toBeNull();
  });

  it('shows only the icon in the closed control when asked, and still lists the options', async () => {
    const user = userEvent.setup();
    render(
      <OptionSelect
        ariaLabel="Quality"
        icon={<svg data-testid="icon-sparkles" />}
        isIconOnly
        onValueChange={() => {}}
        options={[
          { label: 'High', value: 'high' },
          { label: 'Draft', value: 'draft' },
        ]}
        value="high"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Quality' });
    expect(trigger).not.toHaveTextContent('High');
    expect(
      trigger.querySelector('[data-testid="icon-sparkles"]'),
    ).not.toBeNull();

    await user.click(trigger);

    expect(screen.getByRole('option', { name: 'Draft' })).toBeVisible();
  });

  it('chooses the empty value as a none option', async () => {
    const user = userEvent.setup();
    render(<NoneHarness />);

    await user.click(screen.getByRole('combobox', { name: 'Folder' }));
    await user.click(screen.getByRole('option', { name: 'No folder' }));

    expect(screen.getByRole('status', { name: 'Chosen' })).toHaveTextContent(
      'empty',
    );
  });
});
