import { createContext, use } from 'react';
import type { AgentWorkspaceContextValue } from '@/features/agents/props/agent-workspace-context.props';

export type { AgentWorkspaceContextValue };

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
