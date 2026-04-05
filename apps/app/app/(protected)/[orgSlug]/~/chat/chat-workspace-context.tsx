'use client';

import type { AgentApiService } from '@genfeedai/agent';
import { createContext, useContext } from 'react';

export interface ChatWorkspaceContextValue {
  agentApiService: AgentApiService;
  isLoaded: boolean;
  isOnboarding: boolean;
  handleOAuthConnect: (platform: string) => Promise<void>;
  completeOnboardingFlow: () => Promise<void>;
}

export const ChatWorkspaceContext =
  createContext<ChatWorkspaceContextValue | null>(null);

export function useChatWorkspace(): ChatWorkspaceContextValue {
  const ctx = useContext(ChatWorkspaceContext);
  if (!ctx) {
    throw new Error(
      'useChatWorkspace must be used within ChatWorkspaceLayoutClient',
    );
  }
  return ctx;
}
