import type { AgentThreadEventType } from '@api/services/agent-threading/types/agent-thread.types';
import type { AgentThreadEvent } from '@genfeedai/prisma';

export type { AgentThreadEvent } from '@genfeedai/prisma';

export interface AgentThreadEventDocument extends AgentThreadEvent {
  eventId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  payload?: Record<string, unknown>;
  type: AgentThreadEventType;
  userId?: string;
  [key: string]: unknown;
}
