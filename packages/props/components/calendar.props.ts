import type { ReactNode } from 'react';

export interface CalendarItem {
  id: string;
  title: string;
  scheduledDate?: string | Date;
  status: string;
  isDisabled?: boolean;
}

/**
 * The calendar layouts a host can offer. Deliberately product-level names rather
 * than FullCalendar view ids, so a host never has to know which plugin backs a
 * view.
 */
export type CalendarViewKey = 'day' | 'week' | 'month' | 'list';

/**
 * Visual weight of an event badge. Tones map to classes in
 * `packages/styles/calendar.css` rather than utility classes: the badge DOM is
 * constructed at runtime inside FullCalendar's `eventContent`, and Tailwind
 * cannot see class names that only exist at runtime.
 */
export type CalendarEventBadgeTone =
  | 'danger'
  | 'info'
  | 'muted'
  | 'success'
  | 'warning';

export interface CalendarEventBadge {
  label: string;
  tone: CalendarEventBadgeTone;
}

/**
 * One publish destination rendered on an event as a platform icon. `id` is the
 * canonical lowercase platform id keying the shared platform-icon lookup;
 * `label` is the human name carried into the icon group's tooltip/aria-label.
 */
export interface CalendarEventChannel {
  id: string;
  label: string;
}

/**
 * Compact metadata rendered inside a dense calendar event. `shortLabel` is the
 * visible week-grid token (for example `IG`); `label` remains the full,
 * accessible channel name.
 */
export interface CalendarEventIndicator {
  label: string;
  shortLabel: string;
}

/**
 * A drag-reschedule the host has not committed yet. `revert` restores the event
 * to its previous slot and must be called when the mutation fails, so the
 * calendar never keeps an optimistic position the backend rejected.
 */
export interface CalendarEventDrop<T extends CalendarItem> {
  item: T;
  revert: () => void;
  start: Date;
}

export interface ContentCalendarProps<T extends CalendarItem> {
  items: T[];
  title?: string;
  description?: string;
  onEventClick: (item: T) => void;
  onDatesChange: (start: Date, end: Date) => void;
  getEventColor: (item: T) => string;
  /**
   * Status badge rendered inside the event cell. Return `null` to keep
   * FullCalendar's default rendering for that event.
   */
  getEventBadge?: (item: T) => CalendarEventBadge | null;
  /**
   * Channels the event publishes to, rendered as platform icons ahead of the
   * title so a dense week grid still shows where each release goes. Return an
   * empty list to render that event without icons.
   */
  getEventChannels?: (item: T) => CalendarEventChannel[];
  /**
   * Channel or destination metadata rendered before the status badge. The
   * calendar keeps one token visible and summarizes the remainder so release
   * groups stay readable in narrow week columns.
   */
  getEventIndicators?: (item: T) => CalendarEventIndicator[];
  /**
   * Per-item drag eligibility. Dragging stays off unless a host supplies both
   * this and `onEventDrop`.
   */
  isItemDraggable?: (item: T) => boolean;
  /**
   * Called once a drag lands, before the host has persisted anything.
   */
  onEventDrop?: (change: CalendarEventDrop<T>) => void;
  /**
   * Empty-cell click. Used to book a one-off missing slot at that instant.
   */
  onDateClick?: (start: Date) => void;
  /**
   * Layout shown on first render. Subsequent view switches are owned by the
   * calendar, so this is genuinely initial rather than a controlled value.
   */
  initialView?: CalendarViewKey;
  /**
   * Layouts offered in the header toolbar, in display order. A single-entry list
   * hides the switcher entirely.
   */
  views?: CalendarViewKey[];
  filterControls?: ReactNode;
  modal?: ReactNode;
  /**
   * While the host is still fetching the visible window, keep FullCalendar
   * unmounted. A first-paint construct/render throw inside the host would
   * otherwise loop the protected-shell ErrorBoundary on Try Again.
   */
  isLoading?: boolean;
  /**
   * Rendered in place of the (otherwise blank) time grid when there are no
   * schedulable events. Lets the host surface a meaningful empty state instead
   * of a full 48-row grid that reads as broken rather than "no events".
   */
  emptyState?: ReactNode;
}
