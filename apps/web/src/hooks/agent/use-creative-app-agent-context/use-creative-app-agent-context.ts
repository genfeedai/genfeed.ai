'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import type { CreativeAppAgentContext } from '@genfeedai/contracts/interfaces';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Tells the agent which creative app the viewer is on, whether a project is
 * open, and the brand's projects. The context joins the page context the
 * protected layout already keeps for this route and leaves with the page.
 * Pass `null` while the project list is still loading so the agent never sees
 * a half-known list.
 */
export function useCreativeAppAgentContext(
  creativeApp: CreativeAppAgentContext | null,
): void {
  const pathname = usePathname();
  const setPageContext = useAgentChatStore((state) => state.setPageContext);

  useEffect(() => {
    if (!creativeApp) {
      return;
    }

    const openApp = creativeApp;

    function apply(): void {
      const current = useAgentChatStore.getState().pageContext;
      if (current?.route === pathname && current.creativeApp === openApp) {
        return;
      }
      setPageContext({
        suggestedActions: [],
        ...(current?.route === pathname ? current : {}),
        creativeApp: openApp,
        route: pathname,
      });
    }

    apply();
    // The protected layout rebuilds the route's context when its suggestions
    // change, which would drop this field; put it back.
    const unsubscribe = useAgentChatStore.subscribe(apply);

    return () => {
      unsubscribe();
      const latest = useAgentChatStore.getState().pageContext;
      if (latest?.route === pathname && latest.creativeApp) {
        const { creativeApp: _creativeApp, ...rest } = latest;
        setPageContext(rest);
      }
    };
  }, [creativeApp, pathname, setPageContext]);
}
