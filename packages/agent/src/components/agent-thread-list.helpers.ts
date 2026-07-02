import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';

export { getErrorMessage } from '@genfeedai/utils/error/error-handler.util';

export const AGENT_REFRESH_CONVERSATIONS_EVENT = 'agent:threads:refresh';

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
  tone: 'neutral' | 'running' | 'warning';
} | null {
  if (thread.pendingInputCount && thread.pendingInputCount > 0) {
    return {
      label: 'Needs input',
      tone: 'warning',
    };
  }

  if (
    options?.activeThreadId === thread.id &&
    (thread.runStatus === 'queued' ||
      thread.runStatus === 'running' ||
      options.activeRunStatus === 'running' ||
      options.activeRunStatus === 'cancelling')
  ) {
    return {
      label: 'Awaiting response',
      tone: 'running',
    };
  }

  if (thread.attentionState === 'updated') {
    return {
      label: 'Updated',
      tone: 'neutral',
    };
  }

  return null;
}

export function getThreadStatusDotClass(options: {
  attentionState?: AgentThread['attentionState'];
  pendingInputCount?: AgentThread['pendingInputCount'];
}): string {
  if (
    options.attentionState === 'needs-input' ||
    (options.pendingInputCount ?? 0) > 0
  ) {
    return 'bg-amber-300';
  }

  if (options.attentionState === 'updated') {
    return 'bg-sky-300';
  }

  return 'bg-white/10';
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
  const threadId = thread.id;

  return (
    typeof threadId === 'string' &&
    threadId.trim().length > 0 &&
    threadId !== 'undefined' &&
    threadId !== 'null'
  );
}

export function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('401') || error.message.includes('Unauthorized')
  );
}
