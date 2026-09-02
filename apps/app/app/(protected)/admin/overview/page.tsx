import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * `/admin/overview` has no surface of its own (only dashboard / activities /
 * analytics children). Close the 404 hole for incomplete overview paths.
 */
export default function AdminOverviewIndexPage() {
  permanentRedirect(APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD);
}
