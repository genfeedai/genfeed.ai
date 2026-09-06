import type { AgentWorkspaceContextValue } from '@props/agent/agent-workspace-context.props';
import { createContext, use } from 'react';

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
