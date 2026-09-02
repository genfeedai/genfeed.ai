import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

export default function Tags() {
  redirect(APP_ROUTES.ADMIN.CONFIGURATION.TAGS_ALL);
}
