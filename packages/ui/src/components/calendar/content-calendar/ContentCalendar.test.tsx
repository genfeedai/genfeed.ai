import type { CalendarItem } from '@genfeedai/props/components/calendar.props';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import ContentCalendar from '@ui/calendar/content-calendar/ContentCalendar';
import type { CalendarOptions, EventInput } from 'fullcalendar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calendarMocks = vi.hoisted(() => {
  const instances: Array<{
    destroy: ReturnType<typeof vi.fn>;
    options: CalendarOptions;
    render: () => void;
  }> = [];

  let importBarrier: Promise<void> | null = null;
  let releaseImportBarrier: (() => void) | null = null;
  let shouldThrowOnConstruct = false;

  class MockCalendar {
    destroy = vi.fn();
    options: CalendarOptions;

    constructor(_element: HTMLElement, options: CalendarOptions) {
      if (shouldThrowOnConstruct) {
        throw new Error('Unable to load FullCalendar component');
      }
      this.options = options;
      instances.push(this);
    }

    render() {
      this.options.datesSet?.(createDatesSetArg('2026-03-09', '2026-03-16'));
    }
  }

  function createDatesSetArg(
    startDate: string,
    endDate: string,
    viewType = 'timeGridWeek',
  ) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    return {
      end,
      endStr: end.toISOString(),
      start,
      startStr: start.toISOString(),
      timeZone: 'UTC',
      view: { type: viewType },
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
    failNextConstruct() {
      shouldThrowOnConstruct = true;
    },
    instances,
    resetConstructFailure() {
      shouldThrowOnConstruct = false;
    },
  };
});

vi.mock('fullcalendar', async () => {
  await calendarMocks.waitForImportGate();
  return {
    Calendar: calendarMocks.Calendar,
    default: calendarMocks.Calendar,
  };
});

vi.mock('fullcalendar/timegrid', async () => {
  await calendarMocks.waitForImportGate();
  return {
    default: {},
  };
});

vi.mock('fullcalendar/daygrid', async () => {
  await calendarMocks.waitForImportGate();
  return {
    default: {},
  };
});

vi.mock('fullcalendar/list', async () => {
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
    calendarMocks.resetConstructFailure();
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

  it('offers the requested layouts in the header toolbar', async () => {
    render(
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

    expect(calendarMocks.instances[0]?.options.headerToolbar).toEqual({
      center: 'title',
      left: 'prev,next',
      right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek',
    });
  });

  it('hides the switcher when only one layout is offered', async () => {
    render(
      <ContentCalendar
        items={[]}
        views={['week']}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    expect(calendarMocks.instances[0]?.options.headerToolbar).toEqual(
      expect.objectContaining({ right: '' }),
    );
  });

  // The instance is torn down and rebuilt on every data refresh, so a view the
  // operator picked has to outlive it — including a switch that covers the same
  // range as the view it replaced.
  it('rebuilds the calendar on the layout the operator last chose', async () => {
    const { rerender } = render(
      <ContentCalendar
        items={[makeItem()]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });
    expect(calendarMocks.instances[0]?.options.initialView).toBe(
      'timeGridWeek',
    );

    act(() => {
      calendarMocks.instances[0]?.options.datesSet?.(
        calendarMocks.createDatesSetArg('2026-03-09', '2026-03-16', 'listWeek'),
      );
    });

    rerender(
      <ContentCalendar
        items={[makeItem({ id: 'item-2' })]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(2);
    });
    expect(calendarMocks.instances[1]?.options.initialView).toBe('listWeek');
  });

  it('marks only eligible events as draggable', async () => {
    render(
      <ContentCalendar
        items={[makeItem(), makeItem({ id: 'item-2', isDisabled: true })]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        isItemDraggable={() => true}
        onEventDrop={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    const options = latestOptions();
    const events = options.events as EventInput[];

    expect(options.editable).toBe(true);
    expect(events[0]?.editable).toBe(true);
    expect(events[1]?.editable).toBe(false);
  });

  it('leaves the calendar read-only when the host handles no drops', async () => {
    render(
      <ContentCalendar
        items={[makeItem()]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        isItemDraggable={() => true}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    const options = latestOptions();

    expect(options.editable).toBe(false);
    expect((options.events as EventInput[])[0]?.editable).toBe(false);
  });

  it('hands a dropped event to the host without committing it', async () => {
    const item = makeItem();
    const onEventDrop = vi.fn();
    const revert = vi.fn();
    const start = new Date('2026-03-11T09:00:00.000Z');

    render(
      <ContentCalendar
        items={[item]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        isItemDraggable={() => true}
        onEventDrop={onEventDrop}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    act(() => {
      dropEvent({
        event: { extendedProps: { item }, start, title: item.title },
        revert,
      });
    });

    expect(onEventDrop).toHaveBeenCalledWith({ item, revert, start });
    expect(revert).not.toHaveBeenCalled();
  });

  it('reverts a drop that lands without a start instant', async () => {
    const item = makeItem();
    const onEventDrop = vi.fn();
    const revert = vi.fn();

    render(
      <ContentCalendar
        items={[item]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        isItemDraggable={() => true}
        onEventDrop={onEventDrop}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    act(() => {
      dropEvent({
        event: { extendedProps: { item }, start: null, title: item.title },
        revert,
      });
    });

    expect(revert).toHaveBeenCalledTimes(1);
    expect(onEventDrop).not.toHaveBeenCalled();
  });

  it('renders compact channel indicators and status beside a truncatable title', async () => {
    const item = makeItem();

    render(
      <ContentCalendar
        items={[item]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        getEventBadge={() => ({ label: 'Failed', tone: 'danger' })}
        getEventIndicators={() => [
          { label: 'Instagram', shortLabel: 'IG' },
          { label: 'LinkedIn', shortLabel: 'LI' },
        ]}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    const content = renderEventContent(item);
    const node = expectDomNode(content);

    expect(node.querySelector('.gen-calendar-event-time')?.textContent).toBe(
      '09:00',
    );
    expect(node.querySelector('.gen-calendar-event-title')?.textContent).toBe(
      'Launch note',
    );

    const indicators = node.querySelector('.gen-calendar-event-indicators');
    expect(indicators?.textContent).toBe('IG+1');
    expect(indicators).toHaveAttribute(
      'aria-label',
      'Channels: Instagram, LinkedIn',
    );
    expect(indicators).toHaveAttribute('title', 'Instagram, LinkedIn');

    const badge = node.querySelector('.gen-calendar-event-badge');
    expect(badge?.textContent).toBe('Failed');
    expect(badge?.className).toContain('gen-calendar-event-badge--danger');
  });

  it('renders channel icons cloned from the platform sprite', async () => {
    const item = makeItem();

    render(
      <ContentCalendar
        items={[item]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        getEventBadge={() => ({ label: 'Scheduled', tone: 'info' })}
        getEventChannels={() => [
          { id: 'instagram', label: 'Instagram' },
          { id: 'tiktok', label: 'TikTok' },
        ]}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    const node = expectDomNode(renderEventContent(item));
    const channels = node.querySelector('.gen-calendar-event-channels');

    expect(channels?.getAttribute('aria-label')).toBe(
      'Channels: Instagram, TikTok',
    );
    expect(channels?.querySelectorAll('svg')).toHaveLength(2);
    // Icons lead the title so a dense week grid scans by destination first.
    expect(node.firstElementChild?.className).toBe('gen-calendar-event-time');
    expect(channels?.nextElementSibling?.className).toBe(
      'gen-calendar-event-title',
    );
    expect(node.querySelector('.gen-calendar-event-badge')).not.toBeNull();
  });

  it('renders channels without a badge when the host supplies none', async () => {
    const item = makeItem();

    render(
      <ContentCalendar
        items={[item]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        getEventChannels={() => [{ id: 'youtube', label: 'YouTube' }]}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    const node = expectDomNode(renderEventContent(item));

    expect(
      node.querySelector('.gen-calendar-event-channels svg'),
    ).not.toBeNull();
    expect(node.querySelector('.gen-calendar-event-badge')).toBeNull();
  });

  it('skips channels whose platform has no icon in the sprite', async () => {
    const item = makeItem();

    render(
      <ContentCalendar
        items={[item]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        getEventBadge={() => ({ label: 'Scheduled', tone: 'info' })}
        getEventChannels={() => [{ id: 'not-a-platform', label: 'Mystery' }]}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    const node = expectDomNode(renderEventContent(item));

    expect(node.querySelector('.gen-calendar-event-channels')).toBeNull();
    expect(node.querySelector('.gen-calendar-event-badge')).not.toBeNull();
  });

  it('drops the duplicated time from list rows', async () => {
    const item = makeItem();

    render(
      <ContentCalendar
        items={[item]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        getEventBadge={() => ({ label: 'Scheduled', tone: 'info' })}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    const content = renderEventContent(item, { viewType: 'listWeek' });

    expect(
      expectDomNode(content).querySelector('.gen-calendar-event-time'),
    ).toBeNull();
  });

  it('does not mount FullCalendar while the host is still loading', () => {
    render(
      <ContentCalendar
        items={[makeItem()]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        isLoading
      />,
    );

    expect(screen.getByTestId('calendar-loading')).toBeVisible();
    expect(calendarMocks.instances).toHaveLength(0);
  });

  it('renders an inline error instead of throwing when FullCalendar fails to start', async () => {
    calendarMocks.failNextConstruct();

    render(
      <ContentCalendar
        items={[makeItem()]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Calendar failed to load' }),
    ).toBeVisible();
    expect(
      screen.getByText(/the schedule grid could not start/i),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(calendarMocks.instances).toHaveLength(0);
  });

  it('falls back to default rendering when an item has no badge', async () => {
    const item = makeItem();

    render(
      <ContentCalendar
        items={[item]}
        onEventClick={vi.fn()}
        onDatesChange={vi.fn()}
        getEventColor={() => '#8b5cf6'}
        getEventBadge={() => null}
      />,
    );

    await waitFor(() => {
      expect(calendarMocks.instances).toHaveLength(1);
    });

    expect(renderEventContent(item)).toBe(true);
  });
});

function makeItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: 'item-1',
    scheduledDate: '2026-03-10T09:00:00.000Z',
    status: 'scheduled',
    title: 'Launch note',
    ...overrides,
  };
}

function latestOptions(): CalendarOptions {
  const options = calendarMocks.instances.at(-1)?.options;

  if (!options) {
    throw new Error('Expected a FullCalendar instance to have been built');
  }

  return options;
}

function dropEvent(info: unknown): void {
  (latestOptions().eventDrop as unknown as (arg: unknown) => void)(info);
}

function renderEventContent(
  item: CalendarItem,
  { timeText = '09:00', viewType = 'timeGridWeek' } = {},
): unknown {
  const generator = latestOptions().eventContent as unknown as (
    arg: unknown,
  ) => unknown;

  return generator({
    event: { extendedProps: { item }, title: item.title },
    timeText,
    view: { type: viewType },
  });
}

function expectDomNode(content: unknown): HTMLElement {
  const node = (content as { domNodes?: HTMLElement[] }).domNodes?.[0];

  if (!node) {
    throw new Error('Expected eventContent to return a single DOM node');
  }

  return node;
}
