'use client';

import type { AgentApiService } from '@genfeedai/agent';
import { createContext, use } from 'react';

export interface AgentWorkspaceContextValue {
  agentApiService: AgentApiService;
  isLoaded: boolean;
  isOnboarding: boolean;
  handleOAuthConnect: (platform: string) => Promise<void>;
  completeOnboardingFlow: () => Promise<void>;
}

export const AgentWorkspaceContext =
  createContext<AgentWorkspaceContextValue | null>(null);

export function useAgentWorkspace(): AgentWorkspaceContextValue {
  const ctx = use(AgentWorkspaceContext);
  if (!ctx) {
    throw new Error(
      'useAgentWorkspace must be used within AgentWorkspaceLayoutClient',
    );
  }
  return ctx;
}
