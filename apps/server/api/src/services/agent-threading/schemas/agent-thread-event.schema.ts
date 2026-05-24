import type { AgentThreadEventType } from '@api/services/agent-threading/types/agent-thread.types';
import type { AgentThreadEvent } from '@genfeedai/prisma';

export type { AgentThreadEvent } from '@genfeedai/prisma';

export interface AgentThreadEventDocument extends AgentThreadEvent {
  _id: string;
  eventId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  organization?: string;
  payload?: Record<string, unknown>;
  thread: string;
  type: AgentThreadEventType;
  userId?: string;
  [key: string]: unknown;
}
