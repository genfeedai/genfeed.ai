'use client';

import { isRenderableThreadId } from '@genfeedai/agent';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// The conversation shell is hosted by the agent layout
// (AgentConversationRouteHost) so switching threads never remounts it; this
// component only guards the route.
export default function AgentThreadRouteGuard() {
  const params = useRouteParams<{ id: string; orgSlug: string }>();
  const { replace } = useRouter();
  const { id, orgSlug } = params;
  // A param Next has not resolved yet (a prerendered fallback shell) reads as
  // undefined. That is not a malformed id, and without the organization
  // there is no root to recover to: redirecting then sent people to
  // /undefined/~/agent. Wait until both params are known.
  const isMalformedThreadId = id !== undefined && !isRenderableThreadId(id);

  // Malformed ids (e.g. /agent/undefined from a stale link) never reach the
  // thread shell — recover to the agent root instead of fetching
  // /threads/undefined/*.
  useEffect(() => {
    if (isMalformedThreadId && orgSlug) {
      replace(createOrganizationAppRoute(orgSlug, APP_ROUTES.AGENT.ROOT));
    }
  }, [isMalformedThreadId, orgSlug, replace]);

  return null;
}
