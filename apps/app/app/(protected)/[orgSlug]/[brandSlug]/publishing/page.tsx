import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';

/**
 * Bare `/publishing` is not the canonical home — Overview is.
 * next.config also permanently redirects; this page-level redirect covers
 * App Router navigations that skip those layers.
 */
export default function PublishingIndexPage() {
  redirect(APP_ROUTES.PUBLISHING.OVERVIEW);
}
