'use client';

import { AgentThreadOwnerFilter } from '@genfeedai/contracts/enums';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/** The query param that carries the thread list's owner filter. */
const AGENT_THREAD_OWNER_PARAM = 'owner';

function parseOwnerFilter(value: string | null): AgentThreadOwnerFilter {
  return (
    Object.values(AgentThreadOwnerFilter).find((filter) => filter === value) ??
    AgentThreadOwnerFilter.ALL
  );
}

/**
 * The thread list's owner filter, kept in the URL as `owner` so a view of
 * "Shared with me" survives a reload and can be linked. `all` is the default
 * and leaves the URL clean.
 */
export function useAgentThreadOwnerFilter(): {
  ownerFilter: AgentThreadOwnerFilter;
  setOwnerFilter: (filter: AgentThreadOwnerFilter) => void;
} {
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';

  const ownerFilter = useMemo(
    () =>
      parseOwnerFilter(
        new URLSearchParams(searchParamsString).get(AGENT_THREAD_OWNER_PARAM),
      ),
    [searchParamsString],
  );

  const setOwnerFilter = useCallback(
    (filter: AgentThreadOwnerFilter) => {
      const params = new URLSearchParams(searchParamsString);
      if (filter === AgentThreadOwnerFilter.ALL) {
        params.delete(AGENT_THREAD_OWNER_PARAM);
      } else {
        params.set(AGENT_THREAD_OWNER_PARAM, filter);
      }
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  return { ownerFilter, setOwnerFilter };
}
