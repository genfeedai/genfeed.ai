import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

export default function SettingsRootPage() {
  redirect(APP_ROUTES.ADMIN.SETTINGS.BILLING);
}
