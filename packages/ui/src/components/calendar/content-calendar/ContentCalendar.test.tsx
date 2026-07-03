import type { CalendarOptions } from '@fullcalendar/core';
import { act, render, waitFor } from '@testing-library/react';
import ContentCalendar from '@ui/calendar/content-calendar/ContentCalendar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calendarMocks = vi.hoisted(() => {
  const instances: Array<{
    destroy: ReturnType<typeof vi.fn>;
    options: CalendarOptions;
    render: () => void;
  }> = [];

  class MockCalendar {
    destroy = vi.fn();
    options: CalendarOptions;

    constructor(_element: HTMLElement, options: CalendarOptions) {
      this.options = options;
      instances.push(this);
    }

    render() {
      this.options.datesSet?.(createDatesSetArg('2026-03-09', '2026-03-16'));
    }
  }

  function createDatesSetArg(startDate: string, endDate: string) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    return {
      end,
      endStr: end.toISOString(),
      start,
      startStr: start.toISOString(),
      timeZone: 'UTC',
      view: {},
    } as Parameters<NonNullable<CalendarOptions['datesSet']>>[0];
  }

  return {
    Calendar: MockCalendar,
    createDatesSetArg,
    instances,
  };
});

vi.mock('@fullcalendar/core/index.js', () => ({
  Calendar: calendarMocks.Calendar,
}));

vi.mock('@fullcalendar/timegrid/index.js', () => ({
  default: {},
}));

vi.mock('@fullcalendar/interaction/index.js', () => ({
  default: {},
}));

describe('ContentCalendar', () => {
  beforeEach(() => {
    calendarMocks.instances.length = 0;
  });

  it('skips duplicate datesSet notifications for the same visible range', async () => {
    const onDatesChange = vi.fn();

    render(
      <ContentCalendar
        items={[]}
        onEventClick={vi.fn()}
        onDatesChange={onDatesChange}
        getEventColor={() => '#8b5cf6'}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
      expect(onDatesChange).toHaveBeenCalledTimes(1);
    });

    act(() => {
      calendarMocks.instances[0]?.options.datesSet?.(
        calendarMocks.createDatesSetArg('2026-03-09', '2026-03-16'),
      );
    });

    expect(onDatesChange).toHaveBeenCalledTimes(1);

    act(() => {
      calendarMocks.instances[0]?.options.datesSet?.(
        calendarMocks.createDatesSetArg('2026-03-16', '2026-03-23'),
      );
    });

    expect(onDatesChange).toHaveBeenCalledTimes(2);
  });
});
