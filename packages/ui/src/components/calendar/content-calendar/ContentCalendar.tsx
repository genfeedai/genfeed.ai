'use client';

import type {
  DatesSetArg,
  EventClickArg,
  EventInput,
} from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import type {
  CalendarItem,
  ContentCalendarProps,
} from '@genfeedai/props/components/calendar.props';
import Card from '@ui/card/Card';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';

const FullCalendar = dynamic(
  () => import('@fullcalendar/react').then((mod) => mod.default),
  { ssr: false },
);

export default function ContentCalendar<T extends CalendarItem>({
  items,
  onEventClick,
  onDatesChange,
  getEventColor,
  filterControls,
  modal,
}: ContentCalendarProps<T>) {
  const [, setDateRange] = useState<{ start: Date; end: Date } | null>(null);

  const events: EventInput[] = useMemo(
    () =>
      items
        .filter((item) => item.scheduledDate)
        .map((item) => ({
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
        })),
    [items, getEventColor],
  );

  const handleEventClick = (info: EventClickArg) => {
    if (info.event.extendedProps.isDisabled) {
      return;
    }
    const item = info.event.extendedProps.item as T;
    onEventClick(item);
  };

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      setDateRange({
        end: arg.end,
        start: arg.start,
      });
      onDatesChange(arg.start, arg.end);
    },
    [onDatesChange],
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
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              center: 'title',
              left: 'prev,next',
              right: '',
            }}
            events={events}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            height="auto"
            contentHeight="auto"
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            slotDuration="00:15:00"
            snapDuration="00:15:00"
            defaultTimedEventDuration="00:15:00"
            allDaySlot={false}
            nowIndicator={true}
            firstDay={1}
            eventTimeFormat={{
              hour: '2-digit',
              meridiem: false,
              minute: '2-digit',
            }}
          />
        </div>
      </Card>

      {modal}
    </>
  );
}
