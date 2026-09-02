import type { AgentSessionBindingStatus } from '@api/services/agent-threading/types/agent-thread.types';

export interface AgentSessionBindingDocument {
  activeCommandId?: string;
  id: string;
  isDeleted?: boolean;
  lastSeenAt?: string;
  metadata?: Record<string, unknown>;
  model?: string;
  organizationId: string;
  resumeCursor?: Record<string, unknown>;
  runId?: string;
  status: AgentSessionBindingStatus;
  threadId: string;
  [key: string]: unknown;
}
