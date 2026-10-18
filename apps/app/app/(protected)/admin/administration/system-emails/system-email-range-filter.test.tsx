import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SystemEmailRangeFilter from './system-email-range-filter';
import { useSystemEmailRange } from './use-system-email-range';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

function Harness({ onQuery }: { onQuery: (query: unknown) => void }) {
  const range = useSystemEmailRange();
  onQuery(range.query);

  return <SystemEmailRangeFilter range={range} />;
}

describe('SystemEmailRangeFilter', () => {
  it('applies inclusive UTC calendar days', async () => {
    const onQuery = vi.fn();
    render(<Harness onQuery={onQuery} />);
    fireEvent.change(screen.getByLabelText('From (UTC)'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText('Through (UTC)'), {
      target: { value: '2026-08-31' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Apply dates' }));

    expect(onQuery).toHaveBeenLastCalledWith({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    });
  });

  it('blocks an excessive date range', () => {
    const onQuery = vi.fn();
    render(<Harness onQuery={onQuery} />);
    const initial = onQuery.mock.calls.at(-1)?.[0];
    fireEvent.change(screen.getByLabelText('From (UTC)'), {
      target: { value: '2025-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Through (UTC)'), {
      target: { value: '2026-08-31' },
    });

    expect(screen.getByRole('button', { name: 'Apply dates' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a date range of 1–90 days.',
    );
    expect(onQuery.mock.calls.at(-1)?.[0]).toEqual(initial);
  });
});
