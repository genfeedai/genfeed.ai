import '@testing-library/jest-dom/vitest';
import type { CalendarItem } from '@genfeedai/props/components/calendar.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContentCalendarView from '@ui/calendar/content-calendar/ContentCalendarView';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('ContentCalendar Week view with the real renderer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders seven day headers and time slots for an empty week', async () => {
    const { container } = render(
      <ContentCalendarView
        getEventColor={() => '#808080'}
        initialView="week"
        items={[]}
        onDatesChange={vi.fn()}
        onEventClick={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll('[role="columnheader"][data-date]'),
      ).toHaveLength(7);
    });
    expect(screen.getByRole('table')).toHaveAttribute('aria-colcount', '7');
    expect(container.querySelector('[data-time="09:00:00"]')).not.toBeNull();
    expect(
      Array.from(
        container.querySelectorAll('[role="columnheader"][data-date]'),
        (header) => header.getAttribute('data-date'),
      ),
    ).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('keeps the grid when scheduled posts populate the visible week', async () => {
    const items: CalendarItem[] = [
      {
        id: 'week-monday-post',
        scheduledDate: '2026-10-26T09:00:00Z',
        status: 'scheduled',
        title: 'Monday at nine',
      },
    ];
    const { container } = render(
      <ContentCalendarView
        getEventColor={() => '#808080'}
        initialView="week"
        items={items}
        onDatesChange={vi.fn()}
        onEventClick={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll('[role="columnheader"][data-date]'),
      ).toHaveLength(7);
    });
    expect(container.querySelector('[data-time="09:00:00"]')).not.toBeNull();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'List' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByText('Monday at nine')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Week' }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() => {
      expect(
        container.querySelectorAll('[role="columnheader"][data-date]'),
      ).toHaveLength(7);
    });
  });
});
