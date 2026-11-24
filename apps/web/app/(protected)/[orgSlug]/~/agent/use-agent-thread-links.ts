'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
} from '@contexts/user/brand-context/brand-context.helpers';
import { type AgentThread, useAgentChatStore } from '@genfeedai/agent';
import { createBrandAppRoute } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { buildAgentThreadHref } from '@/lib/navigation/operator-shell';

/**
 * Where a thread opens from the agent's thread list and its transcript: in the
 * thread's own brand, so the topbar follows it. A thread with no brand (or one
 * the brand list does not know) stays in the scope the operator is in.
 * `resolvedThreads` are the archived ones the store never loaded.
 */
export function useAgentThreadLinks(resolvedThreads: readonly AgentThread[]) {
  const { push } = useRouter();
  const { activeHref, orgSlug } = useOrgUrl();
  const { brands, organizationId } = useBrand();
  const threads = useAgentChatStore((state) => state.threads);

  const buildThreadHref = useCallback(
    (threadId: string, options?: { isFull?: boolean }) => {
      const thread =
        threads.find((item) => item.id === threadId) ??
        resolvedThreads.find((item) => item.id === threadId);
      const ownerBrand = thread?.brandId
        ? brands.find(
            (brand) =>
              getBrandEntityId(brand) === thread.brandId &&
              getBrandOrganizationId(brand) === organizationId,
          )
        : undefined;
      if (ownerBrand?.slug && orgSlug) {
        return createBrandAppRoute(
          orgSlug,
          ownerBrand.slug,
          buildAgentThreadHref(threadId, options),
        );
      }
      return activeHref(buildAgentThreadHref(threadId, options));
    },
    [activeHref, brands, orgSlug, organizationId, resolvedThreads, threads],
  );

  // Full view is `?view=full` on the thread's own URL. When that URL is the
  // page already open, rewrite it in place: the App Router follows
  // `history.pushState` without a route request, so the swap is immediate.
  const openFullThread = useCallback(
    (threadId: string) => {
      const href = buildThreadHref(threadId, { isFull: true });
      const [hrefPathname] = href.split('?');
      if (hrefPathname === window.location.pathname) {
        window.history.pushState(null, '', href);
        return;
      }
      push(href);
    },
    [buildThreadHref, push],
  );

  return { buildThreadHref, openFullThread };
}
