import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';

/** Bare `/automation` → complete-path overview home. */
export default function AutomationIndexPage() {
  redirect(APP_ROUTES.AUTOMATION.OVERVIEW);
}
