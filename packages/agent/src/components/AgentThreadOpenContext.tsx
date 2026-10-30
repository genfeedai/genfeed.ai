'use client';

import { createContext, use } from 'react';

/**
 * Opens a thread where the surface keeps its thread list (the Threads panel
 * beside the master). Absent everywhere else, so a thread chip falls back to a
 * link to the thread's own page.
 */
const AgentThreadOpenContext = createContext<
  ((threadId: string) => void) | null
>(null);

export const AgentThreadOpenProvider = AgentThreadOpenContext;

export function useAgentThreadOpen(): ((threadId: string) => void) | null {
  return use(AgentThreadOpenContext);
}
