'use client';

import ContentCalendarPage from './content-calendar-page';

export default function CalendarPageContent({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  return <ContentCalendarPage embedded={embedded} />;
}
