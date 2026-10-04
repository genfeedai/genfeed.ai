'use client';

import { AGENT_CONNECT_EVENT } from '@ui/buttons/connect-agent/connect-agent.event';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const LazyAgentConnectDialog = dynamic(() => import('./AgentConnectDialog'), {
  ssr: false,
});

function isConnectDeepLink(): boolean {
  return (
    window.location.pathname === '/agent' && window.location.hash === '#connect'
  );
}

/**
 * Always-mounted, dependency-free listener. The dialog chunk is only fetched
 * on the first open event or `/agent#connect` deep link; once loaded, the
 * dialog owns its own listeners and opens itself on mount.
 */
export default function AgentConnectLauncher() {
  const [isRequested, setIsRequested] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isRequested) {
      return;
    }

    const request = () => {
      // Capture synchronously: focus may move while the chunk downloads.
      trigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setIsRequested(true);
    };
    const requestDeepLink = () => {
      if (isConnectDeepLink()) {
        request();
      }
    };

    requestDeepLink();
    window.addEventListener(AGENT_CONNECT_EVENT, request);
    window.addEventListener('hashchange', requestDeepLink);
    return () => {
      window.removeEventListener(AGENT_CONNECT_EVENT, request);
      window.removeEventListener('hashchange', requestDeepLink);
    };
  }, [isRequested]);

  return isRequested ? (
    <LazyAgentConnectDialog openOnMount returnFocusTo={trigger.current} />
  ) : null;
}
