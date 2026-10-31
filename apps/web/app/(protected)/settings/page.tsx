import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/**
 * Bare `/settings` is the settings shell, not a page. Personal is the home.
 * next.config + proxy also redirect; this covers App Router navigations.
 */
export default function SettingsIndexPage() {
  redirect(APP_ROUTES.SETTINGS.PERSONAL);
}
