import type {
  AgentPendingApproval,
  AgentPendingInputRequest,
  AgentThreadActiveRun,
  AgentThreadLastAssistantMessage,
  AgentThreadLatestPlan,
  AgentThreadTimelineEntry,
  AgentThreadUiBlocksState,
} from '@api/services/agent-threading/types/agent-thread.types';
import type { AgentThreadSnapshot } from '@genfeedai/prisma';

export type { AgentThreadSnapshot } from '@genfeedai/prisma';

export interface AgentThreadSnapshotDocument extends AgentThreadSnapshot {
  _id: string;
  activeRun?: AgentThreadActiveRun;
  lastAssistantMessage?: AgentThreadLastAssistantMessage;
  lastSequence: number;
  latestProposedPlan?: AgentThreadLatestPlan;
  latestUiBlocks?: Partial<AgentThreadUiBlocksState>;
  memorySummaryRefs: string[];
  organization?: string;
  pendingApprovals: AgentPendingApproval[];
  pendingInputRequests: AgentPendingInputRequest[];
  profileSnapshot?: Record<string, unknown>;
  sessionBinding?: Record<string, unknown>;
  source?: string;
  thread: string;
  threadStatus?: string;
  timeline: AgentThreadTimelineEntry[];
  title?: string;
  [key: string]: unknown;
}
