'use client';

import type { IAgentTransfer } from '@genfeedai/contracts/interfaces';
import { createContext, use } from 'react';

export interface AgentHandoffActions {
  /** The teammate says yes: their agent runs the request with their permissions. */
  accept: (transferId: string) => Promise<Pick<IAgentTransfer, 'status'>>;
  decline: (transferId: string) => Promise<Pick<IAgentTransfer, 'status'>>;
  /** Names a member by user id; `undefined` when the directory does not know them. */
  nameOf: (userId: string) => string | undefined;
}

/**
 * What a hand-off card needs from its surface: a way to answer the request and
 * a way to name the teammate on the other end, without the agent package
 * reading the organization's roster. Absent elsewhere, where the card shows the
 * request but offers no answer.
 */
const AgentHandoffContext = createContext<AgentHandoffActions | null>(null);

export const AgentHandoffProvider = AgentHandoffContext;

export function useAgentHandoff(): AgentHandoffActions | null {
  return use(AgentHandoffContext);
}
