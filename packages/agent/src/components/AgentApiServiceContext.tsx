'use client';

import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useContext,
} from 'react';

const AgentApiServiceContext = createContext<AgentApiService | null>(null);

export function AgentApiServiceProvider({
  children,
  service,
}: PropsWithChildren<{ service: AgentApiService }>): ReactElement {
  return (
    <AgentApiServiceContext.Provider value={service}>
      {children}
    </AgentApiServiceContext.Provider>
  );
}

/** Optional so shared pages remain independently renderable in tests/Storybook. */
export function useAgentApiService(): AgentApiService | null {
  return useContext(AgentApiServiceContext);
}
