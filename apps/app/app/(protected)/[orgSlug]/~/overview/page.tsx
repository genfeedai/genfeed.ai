import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/**
 * Org Workspace home is `/workspace/overview`. Bare `/overview` is a leftover
 * alias — next.config + proxy also redirect; this covers App Router hops.
 */
export default function OrgOverviewRedirectPage() {
  redirect(APP_ROUTES.WORKSPACE.OVERVIEW);
}
