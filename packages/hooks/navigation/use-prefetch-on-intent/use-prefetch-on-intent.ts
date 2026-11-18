'use client';

import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useCallback, useContext } from 'react';

/** Pages listing more links than this prepare them on intent, not on view. */
export const LONG_LINK_LIST_THRESHOLD = 20;

export interface PrefetchOnIntentProps {
  onFocus: () => void;
  onPointerDown: () => void;
  onPointerEnter: () => void;
}

/**
 * Props that prepare a destination as soon as someone shows intent to open it:
 * pointer hover, keyboard focus or pointer down. Spread them on a control that
 * navigates in code (`router.push`), where no `<Link>` exists to prefetch the
 * route, or on a `<Link prefetch={false}>` in a long list, where a link
 * prefetching on visibility would queue dozens of requests ahead of the shell.
 *
 * Preparing a destination that is still fresh in the router cache costs no
 * request, so repeated hovers are free. A destination that cannot be prepared
 * still opens through the server.
 */
export function usePrefetchOnIntent(): (
  href: string | null | undefined,
) => PrefetchOnIntentProps {
  // Read from the context rather than `useRouter()`, which throws where no app
  // router is mounted (shared components render in tests and stories). There,
  // preparing a destination is simply skipped.
  const router = useContext(AppRouterContext);

  return useCallback(
    (href) => {
      const prefetch = () => {
        if (href?.startsWith('/')) {
          router?.prefetch(href);
        }
      };

      return {
        onFocus: prefetch,
        onPointerDown: prefetch,
        onPointerEnter: prefetch,
      };
    },
    [router],
  );
}
