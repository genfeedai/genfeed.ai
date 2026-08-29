'use client';

import type {
  CalendarItem,
  ContentCalendarProps,
} from '@genfeedai/props/components/calendar.props';
import { Skeleton } from '@ui/primitives/skeleton';
import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

/**
 * Lazy boundary for the calendar.
 *
 * `ContentCalendarView` statically imports `fullcalendar/all` plus three
 * stylesheets. Every route that reached this module paid for that bundle in its
 * first load, including routes that only render the calendar behind a tab or a
 * modal. FullCalendar also builds against the DOM, so there is nothing to
 * prerender: `ssr: false` is the honest setting rather than an optimisation.
 *
 * `dynamic()` erases the component's generic parameter, so the loader result is
 * re-typed to the generic signature callers already depend on.
 */
const ContentCalendarView = dynamic(
  () => import('@ui/calendar/content-calendar/ContentCalendarView'),
  {
    loading: () => <Skeleton className="h-[36rem] w-full rounded-xl" />,
    ssr: false,
  },
) as <T extends CalendarItem>(props: ContentCalendarProps<T>) => ReactElement;

export default function ContentCalendar<T extends CalendarItem>(
  props: ContentCalendarProps<T>,
): ReactElement {
  return <ContentCalendarView {...props} />;
}
