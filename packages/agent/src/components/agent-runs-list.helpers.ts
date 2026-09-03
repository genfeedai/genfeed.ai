import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import {
  AGENT_RUNTIME_ACTIVE_STATES,
  AgentRuntimeState,
  formatAgentRuntimeStateLabel,
  resolveAgentRuntimeState,
} from '@genfeedai/contracts';

export interface AgentRunListItem {
  decisionHref: string;
  id: string;
  isProjectionStale: boolean;
  runtimeState: AgentRuntimeState;
  startedAt?: string;
  threadId: string;
  threadTitle: string;
}

export function projectThreadToRun(
  thread: AgentThread,
  options?: { isProjectionStale?: boolean },
): AgentRunListItem | null {
  const runtimeState = resolveAgentRuntimeState({
    hasPendingConfirmation: thread.runtimeState === 'awaiting_confirmation',
    pendingInputCount: thread.pendingInputCount,
    snapshotStatus: thread.runtimeState ?? thread.runStatus,
  });

  const isRecentFailure =
    runtimeState === AgentRuntimeState.FAILED ||
    runtimeState === AgentRuntimeState.INTERRUPTED ||
    runtimeState === AgentRuntimeState.CANCELLED;

  if (!AGENT_RUNTIME_ACTIVE_STATES.has(runtimeState) && !isRecentFailure) {
    return null;
  }

  const search = thread.decisionHref?.includes('?')
    ? thread.decisionHref.slice(thread.decisionHref.indexOf('?'))
    : '';

  return {
    decisionHref: `/agent/${thread.id}${search}`,
    id: thread.id,
    isProjectionStale: options?.isProjectionStale === true,
    runtimeState,
    startedAt: thread.lastActivityAt,
    threadId: thread.id,
    threadTitle: thread.title?.trim() || 'Untitled thread',
  };
}

export function groupAgentRuns(runs: AgentRunListItem[]): {
  awaiting: AgentRunListItem[];
  failed: AgentRunListItem[];
  working: AgentRunListItem[];
} {
  const awaiting: AgentRunListItem[] = [];
  const failed: AgentRunListItem[] = [];
  const working: AgentRunListItem[] = [];

  for (const run of runs) {
    if (
      run.runtimeState === AgentRuntimeState.AWAITING_INPUT ||
      run.runtimeState === AgentRuntimeState.AWAITING_CONFIRMATION
    ) {
      awaiting.push(run);
      continue;
    }
    if (
      run.runtimeState === AgentRuntimeState.FAILED ||
      run.runtimeState === AgentRuntimeState.INTERRUPTED ||
      run.runtimeState === AgentRuntimeState.CANCELLED
    ) {
      failed.push(run);
      continue;
    }
    working.push(run);
  }

  return { awaiting, failed, working };
}

export function runStatusLabel(state: AgentRuntimeState): string {
  return formatAgentRuntimeStateLabel(state);
}

export function canRenderRunAsRunning(state: AgentRuntimeState): boolean {
  return state === AgentRuntimeState.RUNNING;
}
