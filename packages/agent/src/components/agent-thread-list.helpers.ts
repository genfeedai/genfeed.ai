import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { isRenderableThreadId } from '@genfeedai/agent/utils/thread-id.util';

export { getErrorMessage } from '@genfeedai/utils/error/error-handler.util';

export const AGENT_REFRESH_CONVERSATIONS_EVENT = 'agent:threads:refresh';
/**
 * Refresh requests arrive in bursts (send + stream finalize + reconnect fire
 * within the same tick); the list coalesces them into one fetch.
 */
export const AGENT_REFRESH_CONVERSATIONS_DEBOUNCE_MS = 150;

export type AgentThreadListFilter = 'all' | 'needs-you' | 'working' | 'pinned';

export interface AgentThreadListGroups {
  needsYou: AgentThread[];
  working: AgentThread[];
  pinned: AgentThread[];
  recent: AgentThread[];
}

function isThreadNeedsYou(thread: AgentThread): boolean {
  return (
    thread.attentionState === 'needs-input' ||
    (thread.pendingInputCount ?? 0) > 0 ||
    thread.runStatus === 'waiting_input'
  );
}

function isThreadWorking(
  thread: AgentThread,
  options?: {
    activeRunStatus?: string | null;
    activeThreadId?: string | null;
    isStreaming?: boolean;
  },
): boolean {
  if (thread.runStatus === 'queued' || thread.runStatus === 'running') {
    return true;
  }

  return (
    thread.id === options?.activeThreadId &&
    (options.isStreaming === true ||
      options.activeRunStatus === 'running' ||
      options.activeRunStatus === 'cancelling')
  );
}

function matchesThreadSearch(
  thread: AgentThread,
  searchQuery: string,
): boolean {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    thread.title,
    thread.lastMessage,
    thread.lastAssistantPreview,
    thread.platform,
    thread.source,
  ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
}

export function groupAgentThreads(
  threads: AgentThread[],
  options: {
    activeRunStatus?: string | null;
    activeThreadId?: string | null;
    filter: AgentThreadListFilter;
    isStreaming?: boolean;
    searchQuery: string;
  },
): AgentThreadListGroups {
  const matchingThreads = threads.filter((thread) => {
    if (!matchesThreadSearch(thread, options.searchQuery)) {
      return false;
    }

    switch (options.filter) {
      case 'needs-you':
        return isThreadNeedsYou(thread);
      case 'working':
        return isThreadWorking(thread, options);
      case 'pinned':
        return thread.isPinned === true;
      default:
        return true;
    }
  });

  const groups: AgentThreadListGroups = {
    needsYou: [],
    working: [],
    pinned: [],
    recent: [],
  };

  for (const thread of matchingThreads) {
    if (isThreadNeedsYou(thread)) {
      groups.needsYou.push(thread);
      continue;
    }
    if (isThreadWorking(thread, options)) {
      groups.working.push(thread);
      continue;
    }
    if (thread.isPinned) {
      groups.pinned.push(thread);
      continue;
    }
    groups.recent.push(thread);
  }

  return groups;
}

export function formatRelativeTime(timestamp?: string): string | null {
  if (!timestamp) {
    return null;
  }

  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) {
    return null;
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));

  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
}

function isThreadActivelyRunning(
  thread: AgentThread,
  options?: {
    activeRunStatus?:
      | 'idle'
      | 'running'
      | 'cancelling'
      | 'completed'
      | 'failed'
      | 'cancelled';
    activeThreadId?: string | null;
  },
): boolean {
  // Prefer explicit attention from stream/API over bare runStatus — the latter
  // can linger as stale local state after a run ends.
  if (thread.attentionState === 'running') {
    return true;
  }

  if (options?.activeThreadId !== thread.id) {
    return false;
  }

  return (
    thread.runStatus === 'queued' ||
    thread.runStatus === 'running' ||
    options.activeRunStatus === 'running' ||
    options.activeRunStatus === 'cancelling'
  );
}

export function getThreadStatusMeta(
  thread: AgentThread,
  options?: {
    activeRunStatus?:
      | 'idle'
      | 'running'
      | 'cancelling'
      | 'completed'
      | 'failed'
      | 'cancelled';
    activeThreadId?: string | null;
  },
): {
  label: string;
  /** running/waiting pulse; failed is solid; null = no disc */
  tone: 'running' | 'warning' | 'failed';
  shouldPulse: boolean;
} | null {
  if (
    thread.attentionState === 'needs-input' ||
    (thread.pendingInputCount ?? 0) > 0 ||
    thread.runStatus === 'waiting_input'
  ) {
    return {
      label: 'Needs input',
      shouldPulse: true,
      tone: 'warning',
    };
  }

  if (isThreadActivelyRunning(thread, options)) {
    return {
      label: 'Running',
      shouldPulse: true,
      tone: 'running',
    };
  }

  if (thread.runStatus === 'failed' || options?.activeRunStatus === 'failed') {
    return {
      label: 'Failed',
      shouldPulse: false,
      tone: 'failed',
    };
  }

  // Idle / updated / completed: no activity disc (Claude-style).
  return null;
}

export function getThreadStatusDotClass(options: {
  attentionState?: AgentThread['attentionState'];
  pendingInputCount?: AgentThread['pendingInputCount'];
  tone?: 'running' | 'warning' | 'failed' | null;
}): string {
  if (options.tone === 'failed') {
    return 'bg-red-400';
  }

  if (
    options.tone === 'warning' ||
    options.attentionState === 'needs-input' ||
    (options.pendingInputCount ?? 0) > 0
  ) {
    return 'bg-amber-300';
  }

  if (options.tone === 'running' || options.attentionState === 'running') {
    // Claude-like violet activity disc
    return 'bg-violet-400';
  }

  return 'bg-transparent';
}

export function getThreadStatusA11yLabel(
  thread: AgentThread,
  statusMeta: ReturnType<typeof getThreadStatusMeta>,
): string {
  if (statusMeta) {
    return `${statusMeta.label} status for ${thread.title || 'Untitled'}`;
  }

  return `Conversation status for ${thread.title || 'Untitled'}`;
}

export function sortThreads(threads: AgentThread[]): AgentThread[] {
  return threads.toSorted((left, right) => {
    const pinnedDelta =
      Number(right.isPinned ?? false) - Number(left.isPinned ?? false);
    if (pinnedDelta !== 0) {
      return pinnedDelta;
    }

    return (
      new Date(right.updatedAt ?? right.createdAt).getTime() -
      new Date(left.updatedAt ?? left.createdAt).getTime()
    );
  });
}

export function hasRenderableThreadId(thread: AgentThread): boolean {
  return isRenderableThreadId(thread.id);
}

export function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('401') || error.message.includes('Unauthorized')
  );
}
