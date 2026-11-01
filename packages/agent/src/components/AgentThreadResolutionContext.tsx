'use client';

import { createContext, use } from 'react';

export interface AgentThreadResolution {
  /** A resolve or reopen for this thread is in flight. */
  isPending: (threadId: string) => boolean;
  /** The thread was marked done by the operator. */
  isResolved: (threadId: string) => boolean;
  reopenThread: (threadId: string) => void | Promise<void>;
  resolveThread: (threadId: string) => void | Promise<void>;
}

/**
 * Lets a card in the master conversation mark a thread it spawned resolved (or
 * reopen it) against the same state the Threads panel reads. Absent everywhere
 * else, so cards on other surfaces show no resolve action.
 */
const AgentThreadResolutionContext =
  createContext<AgentThreadResolution | null>(null);

export const AgentThreadResolutionProvider = AgentThreadResolutionContext;

export function useAgentThreadResolution(): AgentThreadResolution | null {
  return use(AgentThreadResolutionContext);
}
