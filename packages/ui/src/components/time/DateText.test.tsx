import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DateText from './DateText';

describe('DateText', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a time element with the short date and the full date in its tooltip', () => {
    render(<DateText timeZone="UTC" value="2026-10-25T22:41:00Z" />);

    const time = screen.getByText('Oct 25, 10:41 PM');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-10-25T22:41:00.000Z');
    expect(time).toHaveClass('whitespace-nowrap');

    fireEvent.pointerMove(time, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Sunday, October 25, 2026 at 10:41 PM',
    );
  });

  it('shows the year instead of the time for another year', () => {
    render(<DateText timeZone="UTC" value="2025-03-04T08:00:00Z" />);

    expect(screen.getByText('Mar 4, 2025')).toBeInTheDocument();
  });

  it('leaves the time out of a day-precision value', () => {
    render(
      <DateText hasTime={false} timeZone="UTC" value="2026-10-25T22:41:00Z" />,
    );

    const time = screen.getByText('Oct 25');
    fireEvent.pointerMove(time, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Sunday, October 25, 2026',
    );
  });

  it.each([null, undefined, 'not a date'])(
    'says what an empty date means for %s, never a dash',
    (value) => {
      render(<DateText emptyLabel="Not scheduled" value={value} />);

      expect(screen.getByText('Not scheduled')).toBeInTheDocument();
      expect(screen.queryByText('-')).not.toBeInTheDocument();
    },
  );

  it('falls back to "Not set" without a label', () => {
    render(<DateText value={null} />);

    expect(screen.getByText('Not set')).toBeInTheDocument();
  });
});
