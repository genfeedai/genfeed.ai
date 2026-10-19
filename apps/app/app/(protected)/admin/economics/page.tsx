import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { permanentRedirect } from 'next/navigation';

/** `/admin/economics` has no surface of its own; it opens the overview. */
export default function AdminEconomicsIndexPage() {
  permanentRedirect(APP_ROUTES.ADMIN.ECONOMICS.OVERVIEW);
}
