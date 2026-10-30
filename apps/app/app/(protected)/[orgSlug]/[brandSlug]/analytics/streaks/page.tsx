import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StreaksPage from '@/features/streaks/streaks-page';

export const generateMetadata = createPageMetadata('Streaks');

export default function AnalyticsStreaksPage() {
  return <StreaksPage />;
}
