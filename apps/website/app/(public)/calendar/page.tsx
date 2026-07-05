import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import CalendarContent from '@public/calendar/calendar-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Calendar',
  'Plan and schedule your content calendar across every channel. Drag-and-drop scheduling, approval workflows, and a visual pipeline from draft to published.',
  '/calendar',
);

export default function Calendar() {
  return <CalendarContent />;
}
