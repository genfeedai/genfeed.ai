import { Platform, SocialConversationType } from '@genfeedai/contracts';
import type {
  ICredential,
  IPaginatedResponse,
  SocialActionProvenance,
  SocialAutomationState,
  SocialInboxSyncRealtimeEvent,
} from '@genfeedai/contracts/interfaces';
import type { SocialMessageModel } from '@genfeedai/models/social/social-message.model';
import type { DirectMessageReconnectAccount } from '@/features/messages/props/direct-message-reconnect-notice.props';
import type {
  MessagesSyncFeedback,
  MessagesSyncJob,
  MessagesSyncOutcome,
} from '@/features/messages/props/messages-page-state.props';
import type {
  MessagesInboxView,
  MessagesSurface,
} from '@/props/messages/messages-conversation-sidebar.props';

export type {
  MessagesSyncFeedback,
  MessagesSyncJob,
  MessagesSyncOutcome,
} from '@/features/messages/props/messages-page-state.props';

export type MessagesPaginationState = Omit<
  IPaginatedResponse<unknown>,
  'items'
>;

export type MessagesBusyAction =
  | 'suggested-reply'
  | 'draft'
  | 'dm'
  | 'reply'
  | 'status'
  | 'sync'
  | `approve:${string}`
  | `reject:${string}`
  | null;

export const EMPTY_MESSAGES_PAGINATION: MessagesPaginationState = {
  hasNext: false,
  hasPrevious: false,
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 1,
};

export const ALL_BRANDS_FILTER = 'all' as const;

const MESSAGES_SURFACE_VALUES: ReadonlySet<string> = new Set([
  SocialConversationType.COMMENT,
  SocialConversationType.DM,
  SocialConversationType.REPLY,
]);

/** #5502 read the `?type=` inbox filter; anything else means All. */
export function parseMessagesSurface(
  value: string | null | undefined,
): MessagesSurface {
  return value && MESSAGES_SURFACE_VALUES.has(value)
    ? (value as MessagesSurface)
    : 'all';
}

const MESSAGES_INBOX_VIEWS: readonly MessagesInboxView[] = [
  'inbox',
  'unread',
  'review',
  'resolved',
  'archived',
  'all',
];

/** Read the `?status=` inbox filter; anything else means the default, Inbox. */
export function parseMessagesInboxView(
  value: string | null | undefined,
): MessagesInboxView {
  return MESSAGES_INBOX_VIEWS.find((view) => view === value) ?? 'inbox';
}

export const AUTOMATION_OPTIONS: Array<{
  label: string;
  value: SocialAutomationState | 'all';
}> = [
  { label: 'All Automation', value: 'all' },
  { label: 'Manual', value: 'manual' },
  { label: 'Drafted', value: 'drafted' },
  { label: 'Pending Approval', value: 'pending_approval' },
  { label: 'Automated', value: 'automated' },
  { label: 'Failed', value: 'failed' },
];

export const STATUS_LABELS: Record<string, string> = {
  archived: 'Archived',
  needs_review: 'Needs Review',
  open: 'Open',
  resolved: 'Resolved',
};

export const STATUS_STYLES: Record<string, string> = {
  archived: 'bg-tertiary text-gray-800',
  needs_review: 'bg-warning/10 text-warning',
  open: 'bg-info/10 text-info',
  resolved: 'bg-success/10 text-success',
};

const ACTION_LABELS: Record<string, string> = {
  draft: 'Draft',
  post_reply: 'Reply',
  send_dm: 'DM',
};

const ACTOR_LABELS: Record<string, string> = {
  system: 'System',
  user: 'User',
  workflow: 'Workflow',
};

const MESSAGE_TIME = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
});

export function isAbortLike(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' &&
      error !== null &&
      (('name' in error &&
        (error as { name?: string }).name === 'CanceledError') ||
        ('isCancelled' in error &&
          (error as { isCancelled?: boolean }).isCancelled === true)))
  );
}

export function getMessagesErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Messages could not be loaded.';
}

export async function settleMessagesSyncJobs(
  jobs: readonly MessagesSyncJob[],
): Promise<MessagesSyncOutcome> {
  const results = await Promise.allSettled(jobs.map((job) => job.run()));
  const failedPlatforms = jobs.flatMap((job, index) =>
    results[index]?.status === 'rejected' ? [job.platform] : [],
  );

  return {
    failedPlatforms,
    hasSuccess: failedPlatforms.length < jobs.length,
  };
}

export function getMessagesSyncFeedback(params: {
  failedPlatforms: readonly string[];
  hasSuccess: boolean;
  scope: 'all' | 'comments' | 'dms';
}): MessagesSyncFeedback {
  if (!params.hasSuccess) {
    return {
      error: `Sync failed to queue for ${params.failedPlatforms.join(', ')}.`,
      notice: null,
    };
  }

  const started =
    params.scope === 'all'
      ? 'Inbox sync started. New comments and direct messages will appear here once the background jobs finish.'
      : params.scope === 'dms'
        ? 'Direct message sync started. New threads will appear here once the background jobs finish.'
        : 'Comment sync started. New comments will appear here once the background jobs finish.';

  if (params.failedPlatforms.length === 0) {
    return { error: null, notice: started };
  }

  return {
    error: null,
    notice: `${started} Partial failure: ${params.failedPlatforms.join(', ')} failed to queue.`,
  };
}

const SYNC_PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  twitter: 'X',
  youtube: 'YouTube',
};

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function describeSyncResult(event: SocialInboxSyncRealtimeEvent): string {
  const label = SYNC_PLATFORM_LABELS[event.platform] ?? event.platform;
  const surface =
    event.conversationType === 'dm' ? 'direct messages' : 'comments';
  if (event.kind === 'sync-failed') {
    return `${label} ${surface} sync failed: ${event.message ?? 'unknown error'}`;
  }

  const imported = `${pluralize(event.messagesCreated ?? 0, 'new message')} in ${pluralize(event.conversationsCreated ?? 0, 'conversation')}`;
  if (event.postsScanned === undefined) {
    return `${label} ${surface} sync finished: ${imported}.`;
  }
  if (event.postsScanned === 0) {
    return `${label} comments sync finished: no published video is eligible for this account, so nothing was imported.`;
  }
  const failed = event.postFailureCount
    ? ` ${pluralize(event.postFailureCount, 'video')} could not be read.`
    : '';
  return `${label} comments sync finished: scanned ${pluralize(event.postsScanned, 'video')}, saw ${pluralize(event.commentsSeen ?? 0, 'comment')}, imported ${imported}.${failed}`;
}

/**
 * Turns the end-of-job sync events for one Sync click into the screen's
 * notice/error. A failed job is never reported as a finished sync.
 */
export function getMessagesSyncResultFeedback(
  events: readonly SocialInboxSyncRealtimeEvent[],
): MessagesSyncFeedback {
  const failed = events.filter((event) => event.kind === 'sync-failed');
  const completed = events.filter((event) => event.kind === 'sync-completed');
  return {
    error: failed.length > 0 ? failed.map(describeSyncResult).join(' ') : null,
    notice:
      completed.length > 0 ? completed.map(describeSyncResult).join(' ') : null,
  };
}

export function formatMessageTime(value?: string | null): string {
  if (!value) {
    return 'No activity';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No activity';
  }

  return MESSAGE_TIME.format(date);
}

function formatActionLabel(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  return (
    ACTION_LABELS[value] ??
    value
      .split('_')
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' ')
  );
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function getMessageProvenanceItems(message: SocialMessageModel): Array<{
  label: string;
  value: string;
}> {
  const provenance: SocialActionProvenance = message.actionProvenance ?? {};
  const actionLabel = formatActionLabel(provenance.action);
  const actorType = getStringValue(provenance.actorType);
  const actorLabel = actorType
    ? (ACTOR_LABELS[actorType] ?? formatActionLabel(actorType))
    : null;
  const status = getStringValue(provenance.status) ?? message.status;
  const workflowRunId =
    getStringValue(provenance.workflowRunId) ??
    getStringValue(message.workflowRunId);
  const userId =
    getStringValue(provenance.userId) ?? getStringValue(message.userId);
  const actedAt = getStringValue(provenance.actedAt);
  const approvedBy = getStringValue(provenance.approvedBy);
  const rejectedBy = getStringValue(provenance.rejectedBy);
  const items: Array<{ label: string; value: string }> = [];
  const hasActionProvenance = Boolean(
    actionLabel ||
      actorLabel ||
      workflowRunId ||
      actedAt ||
      approvedBy ||
      rejectedBy,
  );

  if (!hasActionProvenance) {
    return items;
  }

  if (actorLabel) {
    items.push({ label: 'Actor', value: actorLabel });
  }
  if (actionLabel) {
    items.push({ label: 'Action', value: actionLabel });
  }
  if (status) {
    items.push({ label: 'Result', value: status });
  }
  if (workflowRunId) {
    items.push({ label: 'Workflow', value: workflowRunId });
  }
  if (userId) {
    items.push({ label: 'User', value: userId });
  }
  if (actedAt) {
    items.push({ label: 'When', value: formatMessageTime(actedAt) });
  }
  if (approvedBy) {
    items.push({ label: 'Approved by', value: approvedBy });
  }
  if (rejectedBy) {
    items.push({ label: 'Rejected by', value: rejectedBy });
  }

  return items;
}

export interface MessagesDirectMessageReconnectAccount
  extends DirectMessageReconnectAccount {
  readonly brandId?: string;
}

/**
 * X accounts in the inbox scope whose stored grant has no DM scope, so the
 * DM sync skips them. Hidden on the Comments surface, where DMs never show.
 */
export function getDirectMessageReconnectAccounts(
  credentials: readonly Pick<
    ICredential,
    | 'brandId'
    | 'directMessageCapability'
    | 'externalHandle'
    | 'externalName'
    | 'id'
    | 'label'
    | 'platform'
  >[],
  surface: MessagesSurface,
): MessagesDirectMessageReconnectAccount[] {
  if (surface === SocialConversationType.COMMENT) {
    return [];
  }

  return credentials
    .filter(
      (credential) =>
        String(credential.platform).toLowerCase() === Platform.TWITTER &&
        credential.directMessageCapability === 'reconnect',
    )
    .map((credential) => ({
      brandId: credential.brandId ?? undefined,
      credentialId: credential.id,
      label: credential.externalHandle
        ? `@${credential.externalHandle.replace(/^@/, '')}`
        : credential.label || credential.externalName || 'X',
    }));
}
