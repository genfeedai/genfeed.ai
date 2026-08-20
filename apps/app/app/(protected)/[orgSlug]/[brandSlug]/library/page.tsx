import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';

/** Bare `/library` → All assets, the unified browser with no axis seeded. */
export default function LibraryIndexPage() {
  redirect(APP_ROUTES.LIBRARY.ASSETS);
}
