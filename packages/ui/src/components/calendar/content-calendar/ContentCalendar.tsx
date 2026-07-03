'use client';

import type {
  CalendarOptions,
  DatesSetArg,
  EventClickArg,
  EventInput,
  Calendar as FullCalendarInstance,
} from '@fullcalendar/core';
import type {
  CalendarItem,
  ContentCalendarProps,
} from '@genfeedai/props/components/calendar.props';
import Card from '@ui/card/Card';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface FullCalendarHostProps {
  options: CalendarOptions;
}

interface CalendarDateRange {
  end: Date;
  start: Date;
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

function FullCalendarHost({ options }: FullCalendarHostProps) {
  const [loadError, setLoadError] = useState<Error | null>(null);
  const calendarRef = useRef<FullCalendarInstance | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let calendar: FullCalendarInstance | null = null;
    let isMounted = true;

    async function loadCalendar() {
      if (!elementRef.current) {
        return;
      }

      setLoadError(null);

      try {
        const [coreModule, timeGridModule, interactionModule] =
          await Promise.all([
            import('@fullcalendar/core/index.js'),
            import('@fullcalendar/timegrid/index.js'),
            import('@fullcalendar/interaction/index.js'),
          ]);

        if (!isMounted || !elementRef.current) {
          return;
        }

        calendar = new coreModule.Calendar(elementRef.current, {
          ...options,
          plugins: [timeGridModule.default, interactionModule.default],
        });
        calendarRef.current = calendar;
        calendar.render();
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setLoadError(
          error instanceof Error
            ? error
            : new Error('Unable to load FullCalendar component'),
        );
      }
    }

    loadCalendar();

    return () => {
      isMounted = false;
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
}: ContentCalendarProps<T>) {
  const dateRangeRef = useRef<CalendarDateRange | null>(null);
  const [, setDateRange] = useState<CalendarDateRange | null>(null);

  const events: EventInput[] = useMemo(
    () =>
      items.reduce<EventInput[]>((acc, item) => {
        if (item.scheduledDate) {
          acc.push({
            backgroundColor: getEventColor(item),
            borderColor: getEventColor(item),
            classNames: item.isDisabled ? ['event-disabled'] : [],
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
    (info: EventClickArg) => {
      if (info.event.extendedProps.isDisabled) {
        return;
      }
      const item = info.event.extendedProps.item as T;
      onEventClick(item);
    },
    [onEventClick],
  );

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
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
        <style>{`
          .fullcalendar-container .fc td,
          .fullcalendar-container .fc th,
          .fullcalendar-container .fc .fc-scrollgrid,
          .fullcalendar-container .fc .fc-scrollgrid-section > * {
            border-color: rgba(255, 255, 255, 0.06) !important;
          }
        `}</style>
        <div className="fullcalendar-container">
          <FullCalendarHost options={calendarOptions} />
        </div>
      </Card>

      {modal}
    </>
  );
}
