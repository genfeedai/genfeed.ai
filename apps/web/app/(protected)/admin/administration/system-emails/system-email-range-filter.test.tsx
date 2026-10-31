import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SystemEmailRangeFilter from './system-email-range-filter';
import { useSystemEmailRange } from './use-system-email-range';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/primitives/date-range-picker', () => ({
  default: ({
    onChange,
  }: {
    onChange: (range: { startDate: Date; endDate: Date }) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onChange({
            endDate: new Date(2026, 7, 31),
            startDate: new Date(2026, 7, 1),
          })
        }
      >
        August
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({
            endDate: new Date(2026, 7, 31),
            startDate: new Date(2025, 0, 1),
          })
        }
      >
        Too long
      </button>
    </>
  ),
}));

function Harness({ onQuery }: { onQuery: (query: unknown) => void }) {
  const range = useSystemEmailRange();
  onQuery(range.query);

  return <SystemEmailRangeFilter range={range} />;
}

describe('SystemEmailRangeFilter', () => {
  it('applies a picked range as inclusive calendar days', async () => {
    const onQuery = vi.fn();
    render(<Harness onQuery={onQuery} />);
    await userEvent.click(screen.getByRole('button', { name: 'August' }));

    expect(onQuery).toHaveBeenLastCalledWith({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    });
  });

  it('blocks an excessive date range', async () => {
    const onQuery = vi.fn();
    render(<Harness onQuery={onQuery} />);
    const initial = onQuery.mock.calls.at(-1)?.[0];
    await userEvent.click(screen.getByRole('button', { name: 'Too long' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a date range of 1–90 days.',
    );
    expect(onQuery.mock.calls.at(-1)?.[0]).toEqual(initial);
  });
});
