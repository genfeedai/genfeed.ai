import { act, render, waitFor } from '@testing-library/react';
import ContentCalendar from '@ui/calendar/content-calendar/ContentCalendar';
import type { CalendarOptions } from 'fullcalendar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calendarMocks = vi.hoisted(() => {
  const instances: Array<{
    destroy: ReturnType<typeof vi.fn>;
    options: CalendarOptions;
    render: () => void;
  }> = [];

  let importBarrier: Promise<void> | null = null;
  let releaseImportBarrier: (() => void) | null = null;

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
    holdNextImport() {
      importBarrier = new Promise<void>((resolve) => {
        releaseImportBarrier = resolve;
      });
    },
    async releaseImport() {
      releaseImportBarrier?.();
      releaseImportBarrier = null;
      importBarrier = null;
      await Promise.resolve();
      await Promise.resolve();
    },
    async waitForImportGate() {
      if (importBarrier) {
        await importBarrier;
      }
    },
    instances,
  };
});

vi.mock('fullcalendar', async () => {
  await calendarMocks.waitForImportGate();
  return {
    Calendar: calendarMocks.Calendar,
  };
});

vi.mock('fullcalendar/timegrid', async () => {
  await calendarMocks.waitForImportGate();
  return {
    default: {},
  };
});

vi.mock('fullcalendar/interaction', async () => {
  await calendarMocks.waitForImportGate();
  return {
    default: {},
  };
});

vi.mock('fullcalendar/themes/classic', async () => {
  await calendarMocks.waitForImportGate();
  return {
    default: {},
  };
});

describe('ContentCalendar', () => {
  beforeEach(() => {
    calendarMocks.instances.length = 0;
  });

  // Must run first while fullcalendar mocks are still cold so the import gate can delay.
  it('does not construct a calendar when unmounted before async imports resolve', async () => {
    calendarMocks.holdNextImport();

    const { unmount } = render(
      <ContentCalendar
        items={[]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(calendarMocks.instances).toHaveLength(0);

    unmount();

    await act(async () => {
      await calendarMocks.releaseImport();
    });

    expect(calendarMocks.instances).toHaveLength(0);
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

  it('destroys the FullCalendar instance and aborts load on unmount', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    const { unmount } = render(
      <ContentCalendar
        items={[]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    const instance = calendarMocks.instances[0];
    unmount();

    expect(instance?.destroy).toHaveBeenCalledTimes(1);
    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });
});
