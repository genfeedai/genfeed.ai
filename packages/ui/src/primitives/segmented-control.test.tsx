import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

const OPTIONS = [
  { label: '24h', value: 'h24' },
  { label: '72h', value: 'h72' },
  { isDisabled: true, label: '7d', value: 'd7' },
] as const;

function Harness({ isDeselectable = false }: { isDeselectable?: boolean }) {
  const [value, setValue] = useState<string | undefined>('h24');
  return isDeselectable ? (
    <SegmentedControl
      ariaLabel="Timeframe"
      isDeselectable
      onValueChange={setValue}
      options={OPTIONS}
      value={value}
    />
  ) : (
    <SegmentedControl
      ariaLabel="Timeframe"
      onValueChange={setValue}
      options={OPTIONS}
      value={value}
    />
  );
}

describe('SegmentedControl', () => {
  it('selects the pressed option and reports it', async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="Timeframe"
        onValueChange={onValueChange}
        options={OPTIONS}
        value="h24"
      />,
    );

    expect(screen.getByRole('radio', { name: '24h' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '72h' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: '72h' }));
    expect(onValueChange).toHaveBeenCalledWith('h72');
  });

  it('keeps the current option when it is pressed again', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('radio', { name: '24h' }));
    expect(screen.getByRole('radio', { name: '24h' })).toBeChecked();
  });

  it('clears the option when deselecting is allowed', async () => {
    render(<Harness isDeselectable />);
    await userEvent.click(screen.getByRole('radio', { name: '24h' }));
    expect(screen.getByRole('radio', { name: '24h' })).not.toBeChecked();
  });

  it('does not select a disabled option', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: '7d' })).toBeDisabled();
  });

  it('toggles each option independently in multiple mode', async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="Platforms"
        onValueChange={onValueChange}
        options={OPTIONS}
        type="multiple"
        value={['h24']}
      />,
    );

    expect(screen.getByRole('button', { name: '24h' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: '72h' }));
    expect(onValueChange).toHaveBeenCalledWith(['h24', 'h72']);
  });

  it('names an icon-only option by its aria label', () => {
    render(
      <SegmentedControl
        ariaLabel="Format"
        onValueChange={vi.fn()}
        options={[{ ariaLabel: 'JSON', icon: <svg />, value: 'json' }]}
        value="json"
      />,
    );
    expect(screen.getByRole('radio', { name: 'JSON' })).toBeChecked();
  });
});
