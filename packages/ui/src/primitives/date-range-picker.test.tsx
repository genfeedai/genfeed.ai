import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DateRangePicker from './date-range-picker';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

describe('DateRangePicker', () => {
  it('keeps quick ranges inside the calendar popover', () => {
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(
      screen.queryByRole('group', { name: 'Quick date ranges' }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button'));

    expect(
      screen.getByRole('group', { name: 'Quick date ranges' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const range = onChange.mock.calls[0][0];
    expect(range.endDate.getTime() - range.startDate.getTime()).toBe(
      29 * 24 * 60 * 60 * 1000,
    );
    expect(
      screen.queryByRole('group', { name: 'Quick date ranges' }),
    ).toBeNull();
  });
});
