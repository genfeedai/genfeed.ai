import { type ReactNode, useState } from 'react';
import ContentCalendarView from '@/features/posts/components/calendar/content-calendar/ContentCalendarView';
import type {
  CalendarItem,
  CalendarToolbar,
  ContentCalendarProps,
} from '@/props/components/calendar.props';

/**
 * Renders the calendar the way a host does: the toolbar it hands over sits in
 * a sub bar above it, so specs see the navigation and the view dropdown.
 */
export function CalendarWithSubbar<T extends CalendarItem>(
  props: Omit<ContentCalendarProps<T>, 'onToolbarChange'>,
): ReactNode {
  const [toolbar, setToolbar] = useState<CalendarToolbar | null>(null);
  return (
    <>
      <div data-testid="subbar">
        {toolbar?.navigation}
        {toolbar?.viewMenu}
      </div>
      <ContentCalendarView {...props} onToolbarChange={setToolbar} />
    </>
  );
}
