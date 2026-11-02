import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DateRangePicker from './date-range-picker';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/web/tests/next-intl.stub'
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

  describe('custom range', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('stays open after the first day and applies the range on the second', () => {
      vi.useFakeTimers({
        now: new Date('2026-11-02T12:00:00Z'),
        toFake: ['Date'],
      });
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('button', { name: /October 5th/ }));

      expect(onChange).not.toHaveBeenCalled();
      expect(
        screen.getByRole('group', { name: 'Quick date ranges' }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /October 9th/ }));

      expect(onChange).toHaveBeenCalledTimes(1);
      const range = onChange.mock.calls[0][0];
      expect(range.startDate.toISOString()).toBe('2026-10-05T00:00:00.000Z');
      expect(range.endDate.toISOString()).toBe('2026-10-09T00:00:00.000Z');
      expect(
        screen.queryByRole('group', { name: 'Quick date ranges' }),
      ).toBeNull();
      expect(screen.getByRole('button')).toHaveTextContent(
        'Oct 5 - Oct 9, 2026',
      );
    });

    it('orders the range when the second day is earlier than the first', () => {
      vi.useFakeTimers({
        now: new Date('2026-11-02T12:00:00Z'),
        toFake: ['Date'],
      });
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('button', { name: /October 20th/ }));
      fireEvent.click(screen.getByRole('button', { name: /October 12th/ }));

      const range = onChange.mock.calls[0][0];
      expect(range.startDate.toISOString()).toBe('2026-10-12T00:00:00.000Z');
      expect(range.endDate.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    });
  });
});
