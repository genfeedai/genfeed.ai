import type { AgentSessionBindingStatus } from '@api/services/agent-threading/types/agent-thread.types';

export interface AgentSessionBindingDocument {
  _id: string;
  activeCommandId?: string;
  isDeleted?: boolean;
  lastSeenAt?: string;
  metadata?: Record<string, unknown>;
  model?: string;
  organization: string;
  organizationId: string;
  resumeCursor?: Record<string, unknown>;
  runId?: string;
  status: AgentSessionBindingStatus;
  thread: string;
  threadId: string;
  [key: string]: unknown;
}
