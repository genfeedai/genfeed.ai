import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsAccountDetail from '@/features/analytics/accounts/analytics-account-detail';

export const generateMetadata = createPageMetadata('Account analytics');

export default function AnalyticsAccountDetailPage() {
  return <AnalyticsAccountDetail />;
}
