'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';

const COMPOSER_ROUTE_PREFIX = APP_ROUTES.WORKSPACE.INBOX;

/**
 * The task composer lives on the workspace inbox page. From any other route
 * we navigate there first; the request is held briefly and the page consumes
 * it on mount, so the composer opens instead of the click doing nothing.
 */
export function useOpenTaskComposer(): () => void {
  const { push } = useRouter();
  const pathname = normalizeProtectedPathname(usePathname());
  const { href } = useOrgUrl();

  return useCallback(() => {
    dispatchOpenTaskComposer();
    if (!pathname.startsWith(COMPOSER_ROUTE_PREFIX)) {
      push(href(COMPOSER_ROUTE_PREFIX));
    }
  }, [href, pathname, push]);
}
