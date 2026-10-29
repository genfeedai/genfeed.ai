'use client';

import type { AgentOutputHostValue } from '@props/ui/agent-output-shell.props';
import { createContext, use } from 'react';

/**
 * The workspace shell publishes this on routes where the page itself is the
 * conversation's other half, so `AgentOutputShell` can render the shell's
 * conversation, Threads and Context tabs without owning their state.
 */
export const AgentOutputHostContext =
  createContext<AgentOutputHostValue | null>(null);

/** `null` off those routes (unit tests, standalone pages). */
export function useAgentOutputHost(): AgentOutputHostValue | null {
  return use(AgentOutputHostContext);
}
