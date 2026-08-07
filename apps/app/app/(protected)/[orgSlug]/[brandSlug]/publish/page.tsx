import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';

/**
 * Bare `/publish` is not the canonical home — Overview is.
 * next.config also permanently redirects; this page-level redirect covers
 * App Router navigations that skip those layers.
 */
export default function PublishIndexPage() {
  redirect(APP_ROUTES.PUBLISH.OVERVIEW);
}
