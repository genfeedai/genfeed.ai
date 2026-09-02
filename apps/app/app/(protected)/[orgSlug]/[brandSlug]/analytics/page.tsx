import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/** Bare `/analytics` → complete-path overview home. */
export default function AnalyticsIndexPage() {
  redirect(APP_ROUTES.ANALYTICS.OVERVIEW);
}
