import '@testing-library/jest-dom/vitest';
import { CalendarWithSubbar as ContentCalendarView } from '@app-tests/calendar-subbar.harness';
import { selectView } from '@app-tests/view-menu.helpers';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CalendarItem,
  ContentCalendarProps,
} from '@/props/components/calendar.props';

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
    vi.unstubAllEnvs();
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

    await selectView(userEvent.setup(), 'List');
    expect(await screen.findByText('Monday at nine')).toBeInTheDocument();

    await selectView(userEvent.setup(), 'Week');
    await waitFor(() => {
      expect(
        container.querySelectorAll('[role="columnheader"][data-date]'),
      ).toHaveLength(7);
    });
  });

  it('formats the selected timezone and updates it without replacing the items', async () => {
    vi.stubEnv('TZ', 'UTC');
    const props = {
      getEventColor: () => '#808080',
      initialView: 'list',
      items: [
        {
          id: 'timezone-post',
          scheduledDate: '2026-10-26T17:30:00Z',
          status: 'scheduled',
          title: 'Timezone-sensitive post',
        },
      ],
      onDatesChange: vi.fn(),
      onEventClick: vi.fn(),
    } satisfies ContentCalendarProps<CalendarItem>;
    const { rerender } = render(
      <ContentCalendarView {...props} timezone="America/Los_Angeles" />,
    );

    expect(await screen.findByText('10:30')).toBeInTheDocument();

    rerender(<ContentCalendarView {...props} timezone="Asia/Tokyo" />);

    expect(await screen.findByText('02:30')).toBeInTheDocument();
    expect(screen.queryByText('10:30')).not.toBeInTheDocument();
  });
});
