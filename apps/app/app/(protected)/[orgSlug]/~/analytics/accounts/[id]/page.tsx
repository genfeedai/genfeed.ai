import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsAccountDetail from '@pages/analytics/accounts/analytics-account-detail';

export const generateMetadata = createPageMetadata('Account analytics');

export default function OrgAnalyticsAccountDetailPage() {
  return <AnalyticsAccountDetail />;
}
