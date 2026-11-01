import { render, screen } from '@testing-library/react';
import TableDateCell from '@ui/display/table/TableDateCell';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TableDateCell', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a current-year date with its time on one line', () => {
    render(<TableDateCell timeZone="UTC" value="2026-10-25T22:41:00Z" />);

    const time = screen.getByText('Oct 25, 10:41 PM');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-10-25T22:41:00.000Z');
    expect(time).toHaveClass('whitespace-nowrap');
    expect(time).toHaveAttribute(
      'title',
      'Sunday, October 25, 2026 at 10:41 PM',
    );
  });

  it('shows the year instead of the time for an older date', () => {
    render(<TableDateCell timeZone="UTC" value="2025-03-04T08:00:00Z" />);

    expect(screen.getByText('Mar 4, 2025')).toBeInTheDocument();
  });

  it('leaves the time out for day-precision values', () => {
    render(
      <TableDateCell
        hasTime={false}
        timeZone="UTC"
        value="2026-10-25T22:41:00Z"
      />,
    );

    expect(screen.getByText('Oct 25')).toBeInTheDocument();
  });

  it.each([null, undefined, 'not a date'])('renders a dash for %s', (value) => {
    render(<TableDateCell timeZone="UTC" value={value} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
