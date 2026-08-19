'use client';

import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type {
  CalendarItem,
  CalendarViewKey,
  ContentCalendarProps,
} from '@genfeedai/props/components/calendar.props';
import Card from '@ui/card/Card';
import { ErrorFallback } from '@ui/error/ErrorFallback';
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
import 'fullcalendar/skeleton.css';
import 'fullcalendar/themes/classic/palette.css';
import 'fullcalendar/themes/classic/theme.css';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { resolveFullCalendarConstructor } from './resolve-fullcalendar-constructor';

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

const DEFAULT_VIEWS: CalendarViewKey[] = ['day', 'week', 'month', 'list'];

function toViewId(view: CalendarViewKey): string {
  return VIEW_IDS[view];
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
  const calendarRef = useRef<FullCalendarInstance | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let calendar: FullCalendarInstance | null = null;
    const abortController = new AbortController();
    const { signal } = abortController;

    async function loadCalendar() {
      if (!elementRef.current || signal.aborted) {
        return;
      }

      try {
        const [
          coreModule,
          timeGridModule,
          dayGridModule,
          listModule,
          interactionModule,
          themeModule,
        ] = await Promise.all([
          import('fullcalendar'),
          import('fullcalendar/timegrid'),
          import('fullcalendar/daygrid'),
          import('fullcalendar/list'),
          import('fullcalendar/interaction'),
          import('fullcalendar/themes/classic'),
        ]);

        if (signal.aborted || !elementRef.current) {
          return;
        }

        const CalendarCtor = resolveFullCalendarConstructor(coreModule);
        calendar = new CalendarCtor(elementRef.current, {
          ...options,
          plugins: [
            themeModule.default,
            timeGridModule.default,
            dayGridModule.default,
            listModule.default,
            interactionModule.default,
          ],
        }) as FullCalendarInstance;
        calendarRef.current = calendar;
        calendar.render();
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        onError(
          error instanceof Error
            ? error
            : new Error('Unable to load FullCalendar component'),
        );
      }
    }

    void loadCalendar();

    return () => {
      abortController.abort();
      calendar?.destroy();
      if (calendarRef.current === calendar) {
        calendarRef.current = null;
      }
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

export default function ContentCalendar<T extends CalendarItem>({
  items,
  onEventClick,
  onDatesChange,
  getEventColor,
  getEventBadge,
  getEventChannels,
  getEventIndicators,
  isItemDraggable,
  onEventDrop,
  initialView = 'week',
  views = DEFAULT_VIEWS,
  filterControls,
  modal,
  emptyState,
  isLoading = false,
}: ContentCalendarProps<T>) {
  const dateRangeRef = useRef<CalendarDateRange | null>(null);
  const [, setDateRange] = useState<CalendarDateRange | null>(null);
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
          acc.push({
            className: item.isDisabled ? 'event-disabled' : '',
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
      if (info.event.extendedProps.isDisabled) {
        return;
      }
      const item = info.event.extendedProps.item as T;
      onEventClick(item);
    },
    [onEventClick],
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
    [onDatesChange],
  );

  const viewSwitcher = useMemo(
    () => (views.length > 1 ? views.map(toViewId).join(',') : ''),
    [views],
  );

  const calendarOptions: CalendarOptions = useMemo(
    () => ({
      allDaySlot: false,
      contentHeight: 'auto',
      datesSet: handleDatesSet,
      defaultTimedEventDuration: '00:15:00',
      editable: isDragEnabled,
      eventClick: handleEventClick,
      eventContent: handleEventContent,
      eventDrop: handleEventDrop,
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
      handleEventClick,
      handleEventContent,
      handleEventDrop,
      handleDatesSet,
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
        ) : events.length === 0 && emptyState ? (
          emptyState
        ) : (
          <div className="fullcalendar-container" style={calendarThemeStyle}>
            <FullCalendarHost options={calendarOptions} />
          </div>
        )}
      </Card>

      {modal}
    </>
  );
}
