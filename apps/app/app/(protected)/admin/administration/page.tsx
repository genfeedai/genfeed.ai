import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * `/admin/administration` has no surface of its own (only users, roles,
 * subscriptions and the other children). Land on Organizations, the first
 * Administration sidebar item, instead of 404ing the bare path.
 */
export default function AdminAdministrationIndexPage() {
  permanentRedirect(APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS);
}
