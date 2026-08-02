import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';

/** Bare `/automate` → complete-path overview home. */
export default function AutomateIndexPage() {
  redirect(APP_ROUTES.AUTOMATE.OVERVIEW);
}
