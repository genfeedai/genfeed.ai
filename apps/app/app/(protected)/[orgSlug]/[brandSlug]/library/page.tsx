import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/** Bare `/library` → Overview, the Library home (#5502). */
export default function LibraryIndexPage() {
  redirect(APP_ROUTES.LIBRARY.OVERVIEW);
}
