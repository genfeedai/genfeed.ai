import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';

export default function Tags() {
  redirect(APP_ROUTES.ADMIN.CONFIGURATION.TAGS_ALL);
}
