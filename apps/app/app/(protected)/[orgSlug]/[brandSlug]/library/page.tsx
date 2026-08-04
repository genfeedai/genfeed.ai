import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';

/** Bare `/library` → complete-path overview home. */
export default function LibraryIndexPage() {
  redirect(APP_ROUTES.LIBRARY.OVERVIEW);
}
