'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  buildDayViewRows,
  formatClockTime,
  instantForClockTime,
} from '@genfeedai/contracts/api-types/contracts/credential-posting-times.contract';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type {
  CalendarEventAction,
  CalendarItem,
  CalendarViewKey,
  ContentCalendarProps,
} from '@genfeedai/props/components/calendar.props';
import Card from '@ui/card/Card';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import type {
  CalendarOptions,
  DatesSetInfo,
  EventClickInfo,
  EventDisplayInfo,
  EventDropInfo,
  EventInput,
  Calendar as FullCalendarInstance,
} from 'fullcalendar';
import { Calendar as FullCalendar } from 'fullcalendar/all';
import 'fullcalendar/skeleton.css';
import classicThemePlugin from 'fullcalendar/themes/classic';
import 'fullcalendar/themes/classic/palette.css';
import 'fullcalendar/themes/classic/theme.css';
import { useTranslations } from 'next-intl';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';

interface FullCalendarHostProps {
  options: CalendarOptions;
}

interface CalendarDateRange {
  end: Date;
  start: Date;
}

const calendarThemeStyle = {
  '--fc-classic-border': 'hsl(var(--border))',
  '--fc-classic-strong-border': 'hsl(var(--border-strong))',
} as CSSProperties;

/**
 * Product view names → FullCalendar view ids. Hosts pick layouts by intent
 * (`month`) and never name the plugin-specific view (`dayGridMonth`).
 */
const VIEW_IDS: Record<CalendarViewKey, string> = {
  day: 'timeGridDay',
  list: 'listWeek',
  month: 'dayGridMonth',
  week: 'timeGridWeek',
};

const VIEW_KEYS: Record<string, CalendarViewKey> = {
  dayGridMonth: 'month',
  listWeek: 'list',
  timeGridDay: 'day',
  timeGridWeek: 'week',
};

const DEFAULT_VIEWS: CalendarViewKey[] = ['day', 'week', 'month', 'list'];
const DAY_VIEW_ID = VIEW_IDS.day;

function localDateKey(instant: Date, timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
      instant,
    );
  } catch {
    return null;
  }
}

function localClockLabel(instant: Date, timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      timeZone: timezone,
    }).format(instant);
  } catch {
    return null;
  }
}

function scheduledInstant(item: CalendarItem): Date | null {
  if (!item.scheduledDate) {
    return null;
  }
  const date =
    item.scheduledDate instanceof Date
      ? item.scheduledDate
      : new Date(item.scheduledDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface DayViewRowsProps<T extends CalendarItem> {
  getEventColor: (item: T) => string;
  items: T[];
  onDateClick?: (start: Date) => void;
  onEventClick: (item: T) => void;
  rows: Array<{ hour: number; minute: number }>;
  timezone: string;
  visibleDay: Date;
}

function DayViewRows<T extends CalendarItem>({
  getEventColor,
  items,
  onDateClick,
  onEventClick,
  rows,
  timezone,
  visibleDay,
}: DayViewRowsProps<T>) {
  const translate = useTranslations('pages.publishing.calendar');
  const visibleKey = localDateKey(visibleDay, timezone);

  return (
    <div className="gen-calendar-day-rows" data-testid="calendar-day-view-rows">
      {rows.map((row) => {
        const label = formatClockTime(row);
        const rowItems = items.filter((item) => {
          const instant = scheduledInstant(item);
          if (!instant) {
            return false;
          }
          return (
            localDateKey(instant, timezone) === visibleKey &&
            localClockLabel(instant, timezone) === label
          );
        });
        const slotInstant = instantForClockTime({
          date: visibleDay,
          time: row,
          timezone,
        });

        return (
          <div
            className="gen-calendar-day-row"
            data-testid="calendar-day-view-row"
            data-time={label}
            key={label}
          >
            <span className="gen-calendar-day-row-time">{label}</span>
            <div className="gen-calendar-day-row-events">
              {rowItems.map((item) => (
                <Button
                  className="gen-calendar-day-row-event"
                  isDisabled={item.isDisabled}
                  key={item.id}
                  onClick={() => onEventClick(item)}
                  style={{ backgroundColor: getEventColor(item) }}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  {item.title}
                </Button>
              ))}
              {rowItems.length === 0 && onDateClick && slotInstant ? (
                <Button
                  aria-label={translate('scheduleAt', { label })}
                  className="gen-calendar-day-row-empty"
                  onClick={() => onDateClick(slotInstant)}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  {translate('schedule')}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function toViewId(view: CalendarViewKey): string {
  return VIEW_IDS[view];
}

function fromViewId(viewId: string): CalendarViewKey | null {
  return VIEW_KEYS[viewId] ?? null;
}

function CalendarEventActions({ actions }: { actions: CalendarEventAction[] }) {
  return (
    <span className="gen-calendar-event-actions">
      {actions.map((action) => (
        <Button
          key={action.id}
          aria-label={action.label}
          onClick={(event) => {
            event.stopPropagation();
            action.onClick();
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {action.label}
        </Button>
      ))}
    </span>
  );
}

function isSameDateRange(
  dateRange: CalendarDateRange | null,
  start: Date,
  end: Date,
): boolean {
  return (
    dateRange !== null &&
    dateRange.start.getTime() === start.getTime() &&
    dateRange.end.getTime() === end.getTime()
  );
}

function FullCalendarMount({
  onError,
  options,
}: FullCalendarHostProps & { onError: (error: Error) => void }) {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let calendar: FullCalendarInstance | null = null;
    const element = elementRef.current;

    if (!element) {
      return;
    }

    try {
      // Static named imports remove the production ESM namespace ambiguity
      // that made lazy-loaded constructors and plugins differ by bundler.
      // Construction remains effect-only, so FullCalendar never touches the
      // DOM during server rendering.
      calendar = new FullCalendar(element, {
        ...options,
        plugins: [classicThemePlugin],
      }) as FullCalendarInstance;
      calendar.render();
    } catch (error) {
      onError(
        error instanceof Error
          ? error
          : new Error('Unable to load FullCalendar component'),
      );
    }

    return () => {
      calendar?.destroy();
    };
  }, [onError, options]);

  return <div ref={elementRef} />;
}

function FullCalendarHost({ options }: FullCalendarHostProps) {
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  if (loadError) {
    return (
      <ErrorFallback
        description="The schedule grid could not start. Try again, or open the list view."
        error={loadError}
        resetErrorBoundary={() => {
          setLoadError(null);
          setRetryCount((count) => count + 1);
        }}
        title="Calendar failed to load"
      />
    );
  }

  return (
    <FullCalendarMount
      key={retryCount}
      onError={setLoadError}
      options={options}
    />
  );
}

export default function ContentCalendarView<T extends CalendarItem>({
  items,
  onEventClick,
  onDatesChange,
  getEventColor,
  getEventBadge,
  getEventChannels,
  getEventIndicators,
  getEventActions,
  isItemDraggable,
  onEventDrop,
  onDateClick,
  onViewChange,
  initialView = 'week',
  views = DEFAULT_VIEWS,
  filterControls,
  modal,
  emptyState,
  isLoading = false,
  preferredTimes = [],
  timezone = 'UTC',
}: ContentCalendarProps<T>) {
  const dateRangeRef = useRef<CalendarDateRange | null>(null);
  const [, setDateRange] = useState<CalendarDateRange | null>(null);
  const [isDayView, setIsDayView] = useState(initialView === 'day');
  const [visibleDay, setVisibleDay] = useState<Date | null>(null);
  /**
   * The calendar instance is destroyed and rebuilt whenever its options change
   * (a new `items` array is enough), so the active view has to survive outside
   * the instance or every data refresh would snap the operator back to the
   * initial layout. A ref rather than state on purpose: the value is only read
   * when the options are next rebuilt, and holding it in state would rebuild the
   * calendar a second time on every view switch.
   */
  const viewIdRef = useRef<string>(toViewId(initialView));
  const iconSpriteRef = useRef<HTMLDivElement | null>(null);
  const actionRootsRef = useRef(new WeakMap<HTMLElement, Root>());

  const isDragEnabled = Boolean(isItemDraggable && onEventDrop);

  /**
   * Every platform the current items publish to. Rendered once into a hidden
   * sprite so `handleEventContent` — plain DOM by FullCalendar contract — can
   * clone real React-rendered icons from the canonical platform-icon helper
   * instead of maintaining a parallel SVG map.
   */
  const channelIconIds = useMemo(() => {
    if (!getEventChannels) {
      return [];
    }

    const ids = new Set<string>();
    for (const item of items) {
      for (const channel of getEventChannels(item)) {
        ids.add(channel.id);
      }
    }

    return [...ids];
  }, [items, getEventChannels]);

  const events: EventInput[] = useMemo(
    () =>
      items.reduce<EventInput[]>((acc, item) => {
        if (item.scheduledDate) {
          const color = getEventColor(item);
          const isDraggable = Boolean(
            isDragEnabled && !item.isDisabled && isItemDraggable?.(item),
          );
          const statusClass = item.status
            ? `gen-calendar-event-host--${item.status}`
            : '';
          acc.push({
            className: [item.isDisabled ? 'event-disabled' : '', statusClass]
              .filter(Boolean)
              .join(' '),
            color,
            durationEditable: false,
            editable: isDraggable,
            extendedProps: {
              isDisabled: item.isDisabled,
              item,
            },
            id: item.id,
            start: item.scheduledDate,
            title: item.title,
          });
        }
        return acc;
      }, []),
    [items, getEventColor, isDragEnabled, isItemDraggable],
  );

  const handleEventClick = useCallback(
    (info: EventClickInfo) => {
      const target = info.jsEvent?.target;
      if (
        target instanceof Element &&
        target.closest('.gen-calendar-event-actions')
      ) {
        return;
      }
      if (info.event.extendedProps.isDisabled) {
        return;
      }
      const item = info.event.extendedProps.item as T;
      onEventClick(item);
    },
    [onEventClick],
  );

  const handleEventDidMount = useCallback(
    (info: {
      el: HTMLElement;
      event: { extendedProps: { isDisabled?: boolean; item?: T } };
    }) => {
      const item = info.event.extendedProps.item;
      const actions = item && getEventActions ? getEventActions(item) : [];
      if (actions.length > 0) {
        info.el.tabIndex = 0;
        info.el.setAttribute('data-calendar-slot', 'focusable');
        info.el.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }
          if (info.event.extendedProps.isDisabled || !item) {
            return;
          }
          event.preventDefault();
          onEventClick(item);
        });
      }

      const existingRoot = actionRootsRef.current.get(info.el);
      existingRoot?.unmount();
      info.el.querySelector('.gen-calendar-event-actions-root')?.remove();

      if (actions.length === 0) {
        actionRootsRef.current.delete(info.el);
        return;
      }

      const mount = document.createElement('span');
      mount.className = 'gen-calendar-event-actions-root';
      info.el.appendChild(mount);
      const root = createRoot(mount);
      root.render(<CalendarEventActions actions={actions} />);
      actionRootsRef.current.set(info.el, root);
    },
    [getEventActions, onEventClick],
  );

  const handleEventWillUnmount = useCallback((info: { el: HTMLElement }) => {
    const root = actionRootsRef.current.get(info.el);
    root?.unmount();
    actionRootsRef.current.delete(info.el);
  }, []);

  const handleDateClick = useCallback(
    (info: { date: Date }) => {
      onDateClick?.(info.date);
    },
    [onDateClick],
  );

  const handleEventDrop = useCallback(
    (info: EventDropInfo) => {
      const item = info.event.extendedProps.item as T | undefined;
      const start = info.event.start;

      // An all-day drop in month view can clear the start instant. There is no
      // schedule to send in that case, so put the event back rather than
      // guessing a time on the operator's behalf.
      if (!item || !start) {
        info.revert();
        return;
      }

      onEventDrop?.({ item, revert: info.revert, start });
    },
    [onEventDrop],
  );

  const handleEventContent = useCallback(
    (info: EventDisplayInfo): true | { domNodes: HTMLElement[] } => {
      const item = info.event.extendedProps.item as T | undefined;
      const badge = item && getEventBadge ? getEventBadge(item) : null;
      const channels = item && getEventChannels ? getEventChannels(item) : [];
      const indicators =
        item && getEventIndicators ? getEventIndicators(item) : [];

      if (!badge && channels.length === 0 && indicators.length === 0) {
        return true;
      }

      const container = document.createElement('div');
      container.className = 'gen-calendar-event';

      // List views render the time in their own cell, so repeating it here would
      // duplicate it on every row.
      if (info.timeText && !info.view.type.startsWith('list')) {
        const time = document.createElement('span');
        time.className = 'gen-calendar-event-time';
        time.textContent = info.timeText;
        container.appendChild(time);
      }

      const spriteEntries = Array.from(iconSpriteRef.current?.children ?? []);
      const channelIcons = channels.flatMap((channel) => {
        const icon = spriteEntries.find(
          (entry) => entry.getAttribute('data-platform') === channel.id,
        )?.firstElementChild;
        return icon ? [icon.cloneNode(true)] : [];
      });

      if (channelIcons.length > 0) {
        const channelLabels = channels
          .map((channel) => channel.label)
          .join(', ');
        const channelsNode = document.createElement('span');
        channelsNode.className = 'gen-calendar-event-channels';
        channelsNode.setAttribute('role', 'img');
        channelsNode.setAttribute('aria-label', `Channels: ${channelLabels}`);
        channelsNode.title = channelLabels;
        for (const icon of channelIcons) {
          channelsNode.appendChild(icon);
        }
        container.appendChild(channelsNode);
      }

      const title = document.createElement('span');
      title.className = 'gen-calendar-event-title';
      title.textContent = info.event.title;
      container.appendChild(title);

      if (indicators.length > 0) {
        const indicatorGroup = document.createElement('span');
        const indicatorLabels = indicators.map((indicator) => indicator.label);
        indicatorGroup.className = 'gen-calendar-event-indicators';
        indicatorGroup.setAttribute(
          'aria-label',
          `Channels: ${indicatorLabels.join(', ')}`,
        );
        indicatorGroup.setAttribute('role', 'group');
        indicatorGroup.title = indicatorLabels.join(', ');

        const indicator = document.createElement('span');
        indicator.className = 'gen-calendar-event-indicator';
        indicator.textContent = indicators[0]?.shortLabel ?? '';
        indicatorGroup.appendChild(indicator);

        if (indicators.length > 1) {
          const remainder = document.createElement('span');
          remainder.className = 'gen-calendar-event-indicator-more';
          remainder.textContent = `+${indicators.length - 1}`;
          indicatorGroup.appendChild(remainder);
        }

        container.appendChild(indicatorGroup);
      }

      if (badge) {
        const badgeNode = document.createElement('span');
        badgeNode.className = `gen-calendar-event-badge gen-calendar-event-badge--${badge.tone}`;
        badgeNode.textContent = badge.label;
        container.appendChild(badgeNode);
      }

      return { domNodes: [container] };
    },
    [getEventBadge, getEventChannels, getEventIndicators],
  );

  const handleDatesSet = useCallback(
    (arg: DatesSetInfo) => {
      // Recorded before the range check on purpose: switching week → list keeps
      // the identical range, and losing that switch would reset the layout on
      // the next data refresh.
      viewIdRef.current = arg.view.type;
      setIsDayView(arg.view.type === DAY_VIEW_ID);
      setVisibleDay(new Date(arg.start));
      const viewKey = fromViewId(arg.view.type);
      if (viewKey) {
        onViewChange?.(viewKey);
      }

      if (isSameDateRange(dateRangeRef.current, arg.start, arg.end)) {
        return;
      }

      const nextDateRange = {
        end: new Date(arg.end),
        start: new Date(arg.start),
      };

      dateRangeRef.current = nextDateRange;
      setDateRange(nextDateRange);
      onDatesChange(nextDateRange.start, nextDateRange.end);
    },
    [onDatesChange, onViewChange],
  );

  const dayViewRows = useMemo(() => {
    if (!isDayView || !visibleDay) {
      return [];
    }
    return buildDayViewRows({
      date: visibleDay,
      occupiedInstants: items.flatMap((item) => {
        const instant = scheduledInstant(item);
        return instant ? [instant] : [];
      }),
      preferredTimes,
      timezone,
    });
  }, [isDayView, items, preferredTimes, timezone, visibleDay]);

  const viewSwitcher = useMemo(
    () => (views.length > 1 ? views.map(toViewId).join(',') : ''),
    [views],
  );

  const calendarOptions = useMemo(
    (): CalendarOptions & {
      eventDidMount: typeof handleEventDidMount;
      eventWillUnmount: typeof handleEventWillUnmount;
    } => ({
      allDaySlot: false,
      contentHeight: 'auto',
      dateClick: onDateClick ? handleDateClick : undefined,
      datesSet: handleDatesSet,
      defaultTimedEventDuration: '00:15:00',
      editable: isDragEnabled,
      eventClick: handleEventClick,
      eventContent: handleEventContent,
      eventDidMount: handleEventDidMount,
      eventDrop: handleEventDrop,
      eventWillUnmount: handleEventWillUnmount,
      eventTimeFormat: {
        hour: '2-digit',
        meridiem: false,
        minute: '2-digit',
      },
      events,
      firstDay: 1,
      headerToolbar: {
        center: 'title',
        left: 'prev,next',
        right: viewSwitcher,
      },
      height: 'auto',
      initialView: viewIdRef.current,
      nowIndicator: true,
      slotDuration: '00:15:00',
      slotMaxTime: '24:00:00',
      slotMinTime: '00:00:00',
      snapDuration: '00:15:00',
    }),
    [
      events,
      handleDateClick,
      handleEventClick,
      handleEventContent,
      handleEventDidMount,
      handleEventDrop,
      handleEventWillUnmount,
      handleDatesSet,
      onDateClick,
      isDragEnabled,
      viewSwitcher,
    ],
  );

  return (
    <>
      {channelIconIds.length > 0 && (
        <div aria-hidden="true" className="hidden" ref={iconSpriteRef}>
          {channelIconIds.map((platformId) => (
            <span data-platform={platformId} key={platformId}>
              {getPlatformIcon(platformId, 'gen-calendar-event-channel-icon')}
            </span>
          ))}
        </div>
      )}

      {filterControls && (
        <div className="flex justify-end mb-4">{filterControls}</div>
      )}

      <Card className="w-full border border-border" bodyClassName="p-0">
        {isLoading ? (
          <div
            className="fullcalendar-container p-6"
            data-testid="calendar-loading"
          >
            <Skeleton className="h-[32rem] w-full" />
          </div>
        ) : events.length === 0 && emptyState && preferredTimes.length === 0 ? (
          emptyState
        ) : (
          <div
            className={
              isDayView && dayViewRows.length > 0
                ? 'fullcalendar-container gen-calendar-custom-day'
                : 'fullcalendar-container'
            }
            style={calendarThemeStyle}
          >
            <FullCalendarHost options={calendarOptions} />
            {isDayView && dayViewRows.length > 0 && visibleDay ? (
              <DayViewRows
                getEventColor={getEventColor}
                items={items}
                onDateClick={onDateClick}
                onEventClick={onEventClick}
                rows={dayViewRows}
                timezone={timezone}
                visibleDay={visibleDay}
              />
            ) : null}
          </div>
        )}
      </Card>

      {modal}
    </>
  );
}
