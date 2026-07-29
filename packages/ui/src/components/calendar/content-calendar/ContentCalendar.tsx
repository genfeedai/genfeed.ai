'use client';

import type {
  CalendarItem,
  ContentCalendarProps,
} from '@genfeedai/props/components/calendar.props';
import Card from '@ui/card/Card';
import type {
  CalendarOptions,
  DatesSetInfo,
  EventClickInfo,
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

interface FullCalendarHostProps {
  options: CalendarOptions;
}

interface CalendarDateRange {
  end: Date;
  start: Date;
}

const calendarThemeStyle = {
  '--fc-classic-border': 'rgba(255, 255, 255, 0.06)',
  '--fc-classic-strong-border': 'rgba(255, 255, 255, 0.06)',
} as CSSProperties;

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

function FullCalendarHost({ options }: FullCalendarHostProps) {
  const [loadError, setLoadError] = useState<Error | null>(null);
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

      setLoadError(null);

      try {
        const [coreModule, timeGridModule, interactionModule, themeModule] =
          await Promise.all([
            import('fullcalendar'),
            import('fullcalendar/timegrid'),
            import('fullcalendar/interaction'),
            import('fullcalendar/themes/classic'),
          ]);

        if (signal.aborted || !elementRef.current) {
          return;
        }

        calendar = new coreModule.Calendar(elementRef.current, {
          ...options,
          plugins: [
            themeModule.default,
            timeGridModule.default,
            interactionModule.default,
          ],
        });
        calendarRef.current = calendar;
        calendar.render();
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        setLoadError(
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
  }, [options]);

  if (loadError) {
    throw loadError;
  }

  return <div ref={elementRef} />;
}

export default function ContentCalendar<T extends CalendarItem>({
  items,
  onEventClick,
  onDatesChange,
  getEventColor,
  filterControls,
  modal,
  emptyState,
}: ContentCalendarProps<T>) {
  const dateRangeRef = useRef<CalendarDateRange | null>(null);
  const [, setDateRange] = useState<CalendarDateRange | null>(null);

  const events: EventInput[] = useMemo(
    () =>
      items.reduce<EventInput[]>((acc, item) => {
        if (item.scheduledDate) {
          const color = getEventColor(item);
          acc.push({
            className: item.isDisabled ? 'event-disabled' : '',
            color,
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
    [items, getEventColor],
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

  const handleDatesSet = useCallback(
    (arg: DatesSetInfo) => {
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

  const calendarOptions: CalendarOptions = useMemo(
    () => ({
      allDaySlot: false,
      contentHeight: 'auto',
      datesSet: handleDatesSet,
      defaultTimedEventDuration: '00:15:00',
      eventClick: handleEventClick,
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
        right: '',
      },
      height: 'auto',
      initialView: 'timeGridWeek',
      nowIndicator: true,
      slotDuration: '00:15:00',
      slotMaxTime: '24:00:00',
      slotMinTime: '00:00:00',
      snapDuration: '00:15:00',
    }),
    [events, handleEventClick, handleDatesSet],
  );

  return (
    <>
      {filterControls && (
        <div className="flex justify-end mb-4">{filterControls}</div>
      )}

      <Card className="w-full border border-white/[0.06]" bodyClassName="p-0">
        {events.length === 0 && emptyState ? (
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
