import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { MappedSnapshotRunStatus } from '@genfeedai/agent/utils/agent-thread-snapshot.util';
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

/**
 * What the open thread's local store knows about its run. The store resets
 * `activeRunStatus` to `'idle'` on every thread switch and only refills it once
 * the snapshot lands (or never, on a fresh-cache switch), so `'idle'` here means
 * "not hydrated yet", never "finished". Only a definite value overrides the
 * thread's own summary; `idle` / `restoring` / `null` defer to it.
 */
export interface ThreadActivityContext {
  activeRunStatus?: MappedSnapshotRunStatus | null;
  activeThreadId?: string | null;
  isLocallyBusy?: boolean;
  isStreaming?: boolean;
}

export type ThreadActivity = 'needs-you' | 'working' | 'idle';

const LOCAL_WORKING_STATUSES: ReadonlySet<MappedSnapshotRunStatus> = new Set([
  'running',
  'cancelling',
]);
const LOCAL_NEEDS_YOU_STATUSES: ReadonlySet<MappedSnapshotRunStatus> = new Set([
  'awaiting_input',
  'awaiting_confirmation',
]);
const LOCAL_SETTLED_STATUSES: ReadonlySet<MappedSnapshotRunStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);

function isThreadNeedsYou(thread: AgentThread): boolean {
  return (
    thread.attentionState === 'needs-input' ||
    (thread.pendingInputCount ?? 0) > 0 ||
    thread.runStatus === 'waiting_input'
  );
}

/**
 * Single per-thread run-state resolver behind both the sidebar groups and the
 * row glyph. The thread summary (`runStatus` / `attentionState` /
 * `pendingInputCount`, kept current by stream events and snapshots) is the
 * source of truth; the open thread's local status may only add a definite
 * active, waiting, or settled value on top of it. Waiting outranks working.
 */
export function resolveThreadActivity(
  thread: AgentThread,
  context?: ThreadActivityContext,
): ThreadActivity {
  const isActive =
    context?.activeThreadId != null && context.activeThreadId === thread.id;
  const localStatus = isActive ? context?.activeRunStatus : undefined;

  if (
    isThreadNeedsYou(thread) ||
    (localStatus != null && LOCAL_NEEDS_YOU_STATUSES.has(localStatus))
  ) {
    return 'needs-you';
  }

  if (
    isActive &&
    (context?.isStreaming === true ||
      context?.isLocallyBusy === true ||
      (localStatus != null && LOCAL_WORKING_STATUSES.has(localStatus)))
  ) {
    return 'working';
  }

  if (localStatus != null && LOCAL_SETTLED_STATUSES.has(localStatus)) {
    return 'idle';
  }

  return thread.runStatus === 'queued' || thread.runStatus === 'running'
    ? 'working'
    : 'idle';
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
  options: ThreadActivityContext & {
    filter: AgentThreadListFilter;
    searchQuery: string;
    threadUiBusyById?: Record<string, boolean>;
  },
): AgentThreadListGroups {
  const activityOf = (thread: AgentThread): ThreadActivity =>
    resolveThreadActivity(thread, {
      ...options,
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
    const isAwaitingConfirmation =
      thread.runtimeState === 'awaiting_confirmation' ||
      (options?.activeThreadId === thread.id &&
        options.activeRunStatus === 'awaiting_confirmation');
    const isAwaitingInput =
      thread.runtimeState === 'awaiting_input' ||
      (options?.activeThreadId === thread.id &&
        options.activeRunStatus === 'awaiting_input');

    return {
      label: isAwaitingConfirmation
        ? 'Awaiting confirmation'
        : isAwaitingInput
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

  const isActiveThreadFailure =
    options?.activeThreadId === thread.id &&
    options.activeRunStatus === 'failed';

  if (thread.runStatus === 'failed' || isActiveThreadFailure) {
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
