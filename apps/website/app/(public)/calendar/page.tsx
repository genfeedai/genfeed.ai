import CalendarContent from '@public/calendar/calendar-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Content Calendar and Scheduling',
  'Plan and schedule your content calendar across every channel. Drag-and-drop scheduling, approval workflows, and a visual pipeline from draft to published.',
  '/calendar',
);

export default function Calendar() {
  return <CalendarContent />;
}
