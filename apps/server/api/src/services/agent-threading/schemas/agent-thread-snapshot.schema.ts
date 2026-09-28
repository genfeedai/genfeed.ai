import type {
  AgentPendingApproval,
  AgentPendingInputRequest,
  AgentThreadActiveRun,
  AgentThreadLastAssistantMessage,
  AgentThreadLatestPlan,
  AgentThreadTimelineEntry,
  AgentThreadUiBlocksState,
} from '@api/services/agent-threading/types/agent-thread.types';
import type { AgentThreadUiActionRun } from '@genfeedai/contracts/interfaces';
import type { AgentThreadSnapshot } from '@genfeedai/prisma';

export type { AgentThreadSnapshot } from '@genfeedai/prisma';

export interface AgentThreadSnapshotDocument extends AgentThreadSnapshot {
  activeRun?: AgentThreadActiveRun;
  lastAssistantMessage?: AgentThreadLastAssistantMessage;
  lastSequence: number;
  latestProposedPlan?: AgentThreadLatestPlan;
  latestUiBlocks?: Partial<AgentThreadUiBlocksState>;
  memorySummaryRefs: string[];
  pendingApprovals: AgentPendingApproval[];
  pendingInputRequests: AgentPendingInputRequest[];
  profileSnapshot?: Record<string, unknown>;
  sessionBinding?: Record<string, unknown>;
  source?: string;
  threadStatus?: string;
  timeline: AgentThreadTimelineEntry[];
  title?: string;
  uiActionRuns?: AgentThreadUiActionRun[];
  [key: string]: unknown;
}
