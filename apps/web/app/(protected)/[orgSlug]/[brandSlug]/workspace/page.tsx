import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/**
 * Bare `/workspace` is not the canonical home — Overview is.
 * next.config + proxy also redirect; this page-level redirect covers
 * App Router navigations that skip those layers.
 */
export default function WorkspaceIndexPage() {
  redirect(APP_ROUTES.WORKSPACE.OVERVIEW);
}
