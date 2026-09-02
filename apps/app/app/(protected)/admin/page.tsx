import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Bare `/admin` is not a complete path — Overview siblings live under
 * `/admin/overview/*`. Send logo/legacy deep links to the dashboard page.
 */
export default function PlatformAdminIndexPage() {
  permanentRedirect(APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD);
}
