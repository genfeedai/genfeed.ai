import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { sortThreads } from '@genfeedai/agent/utils/sort-agent-threads.util';
import { isRenderableThreadId } from '@genfeedai/agent/utils/thread-id.util';
import type { StatusKey } from '@genfeedai/ui';

export { getErrorMessage } from '@genfeedai/utils/error/error-handler.util';
export { sortThreads };

export type AgentThreadListFilter = 'all' | 'needs-you' | 'working' | 'pinned';

export const ORGANIZATION_THREAD_GROUP_LABEL = 'Organization';

export interface AgentThreadListGroups {
  needsYou: AgentThread[];
  working: AgentThread[];
  pinned: AgentThread[];
  recent: AgentThread[];
}

export interface AgentThreadBrandGroup {
  brandId: string | null;
  label: string;
  threads: AgentThread[];
}

export interface ThreadActivityContext {
  /** A ui-action on this thread is in flight (`threadUiBusyById`). */
  isLocallyBusy?: boolean;
}

export type ThreadActivity = 'needs-you' | 'working' | 'idle';

function isThreadNeedsYou(thread: AgentThread): boolean {
  return (
    thread.attentionState === 'needs-input' ||
    (thread.pendingInputCount ?? 0) > 0 ||
    thread.runStatus === 'waiting_input'
  );
}

/**
 * The one place that decides "working / needs you / idle" for a thread, behind
 * both the sidebar groups and the row glyph. It reads only the thread's own
 * summary (`runStatus`, `attentionState`, `pendingInputCount`), which stream
 * events, snapshots and the store's open-thread mirror keep current. It never
 * consults the open thread's local run status: that resets to `idle` on every
 * switch and would demote a running thread. Waiting on the user outranks
 * working.
 */
export function resolveThreadActivity(
  thread: AgentThread,
  context?: ThreadActivityContext,
): ThreadActivity {
  if (isThreadNeedsYou(thread)) {
    return 'needs-you';
  }

  if (
    context?.isLocallyBusy === true ||
    thread.runStatus === 'queued' ||
    thread.runStatus === 'running'
  ) {
    return 'working';
  }

  return 'idle';
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
    thread.brandLabel,
    thread.platform,
    thread.source,
  ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
}

export function resolveThreadListPreview(thread: AgentThread): string | null {
  const preview =
    thread.lastAssistantPreview?.trim() || thread.lastMessage?.trim() || '';
  return preview.length > 0 ? preview : null;
}

function latestThreadTimestamp(threads: AgentThread[]): string {
  return threads.reduce((latest, thread) => {
    const value = thread.updatedAt || thread.createdAt || '';
    return value > latest ? value : latest;
  }, '');
}

export function groupAgentThreadsByBrand(
  threads: AgentThread[],
  options: {
    searchQuery: string;
  },
): AgentThreadBrandGroup[] {
  const matchingThreads = threads.filter((thread) =>
    matchesThreadSearch(thread, options.searchQuery),
  );
  const grouped = new Map<string, AgentThread[]>();
  const labels = new Map<string, string>();

  for (const thread of matchingThreads) {
    const key = thread.brandId ?? '';
    const existing = grouped.get(key) ?? [];
    existing.push(thread);
    grouped.set(key, existing);
    if (!labels.has(key)) {
      labels.set(
        key,
        thread.brandLabel?.trim() ||
          (key ? key : ORGANIZATION_THREAD_GROUP_LABEL),
      );
    }
  }

  return [...grouped.entries()]
    .map(([key, groupedThreads]) => ({
      brandId: key.length > 0 ? key : null,
      label: labels.get(key) ?? ORGANIZATION_THREAD_GROUP_LABEL,
      threads: sortThreads(groupedThreads),
    }))
    .toSorted((left, right) =>
      latestThreadTimestamp(right.threads).localeCompare(
        latestThreadTimestamp(left.threads),
      ),
    );
}

export function groupAgentThreads(
  threads: AgentThread[],
  options: {
    filter: AgentThreadListFilter;
    searchQuery: string;
    threadUiBusyById?: Record<string, boolean>;
  },
): AgentThreadListGroups {
  const activityOf = (thread: AgentThread): ThreadActivity =>
    resolveThreadActivity(thread, {
      isLocallyBusy: options.threadUiBusyById?.[thread.id] === true,
    });
  const matchingThreads = threads.filter((thread) => {
    if (!matchesThreadSearch(thread, options.searchQuery)) {
      return false;
    }

    switch (options.filter) {
      case 'needs-you':
        return activityOf(thread) === 'needs-you';
      case 'working':
        return activityOf(thread) === 'working';
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
    const activity = activityOf(thread);
    if (activity === 'needs-you') {
      groups.needsYou.push(thread);
      continue;
    }
    if (activity === 'working') {
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

export function getThreadStatusMeta(
  thread: AgentThread,
  options?: ThreadActivityContext,
): {
  label: string;
  tone: 'running' | 'warning' | 'failed';
} | null {
  const activity = resolveThreadActivity(thread, options);

  if (activity === 'needs-you') {
    return {
      label:
        thread.runtimeState === 'awaiting_confirmation'
          ? 'Awaiting confirmation'
          : thread.runtimeState === 'awaiting_input'
            ? 'Awaiting input'
            : 'Needs input',
      tone: 'warning',
    };
  }

  if (activity === 'working') {
    return {
      label: 'Running',
      tone: 'running',
    };
  }

  if (thread.runStatus === 'failed') {
    return {
      label: 'Failed',
      tone: 'failed',
    };
  }

  // Idle / updated / completed: no status glyph.
  return null;
}

export function getThreadStatusKey(options: {
  attentionState?: AgentThread['attentionState'];
  pendingInputCount?: AgentThread['pendingInputCount'];
  tone?: 'running' | 'warning' | 'failed' | null;
}): StatusKey {
  if (options.tone === 'failed') {
    return 'failed';
  }

  if (
    options.tone === 'warning' ||
    options.attentionState === 'needs-input' ||
    (options.pendingInputCount ?? 0) > 0
  ) {
    return 'pending_approval';
  }

  if (options.tone === 'running' || options.attentionState === 'running') {
    return 'running';
  }

  return 'idle';
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
