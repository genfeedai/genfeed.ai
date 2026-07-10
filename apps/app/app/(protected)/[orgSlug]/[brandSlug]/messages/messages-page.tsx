'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  SocialActionProvenance,
  SocialAutomationState,
  SocialConversationModel,
  SocialConversationStatus,
  SocialMessageModel,
  SocialPlatform,
} from '@services/social/messages.service';
import { SocialMessagesService } from '@services/social/messages.service';
import Container from '@ui/layout/container/Container';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import Link from 'next/link';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineBolt,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineInboxStack,
  HiOutlinePaperAirplane,
} from 'react-icons/hi2';

const PLATFORM_OPTIONS: Array<{
  label: string;
  value: SocialPlatform | 'all';
}> = [
  { label: 'All Platforms', value: 'all' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'X / Twitter', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
];

const STATUS_OPTIONS: Array<{
  label: string;
  value: SocialConversationStatus | 'all';
}> = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Needs Review', value: 'needs_review' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Archived', value: 'archived' },
];

const AUTOMATION_OPTIONS: Array<{
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

const STATUS_LABELS: Record<string, string> = {
  archived: 'Archived',
  needs_review: 'Needs Review',
  open: 'Open',
  resolved: 'Resolved',
};

const STATUS_STYLES: Record<string, string> = {
  archived: 'bg-white/5 text-white/38',
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
  agent: 'Agent',
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

function isAbortLike(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'CanceledError')
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Messages could not be loaded.';
}

function formatTime(value?: string | null): string {
  if (!value) {
    return 'No activity';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No activity';
  }

  return MESSAGE_TIME.format(date);
}

function getParticipantLabel(conversation: SocialConversationModel): string {
  return (
    conversation.participantName ||
    conversation.participantHandle ||
    conversation.participantExternalId ||
    'Unknown sender'
  );
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

function getMessageProvenanceItems(message: SocialMessageModel): Array<{
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
  const agentRunId =
    getStringValue(provenance.agentRunId) ?? getStringValue(message.agentRunId);
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
      agentRunId ||
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
  if (agentRunId) {
    items.push({ label: 'Agent', value: agentRunId });
  }
  if (userId) {
    items.push({ label: 'User', value: userId });
  }
  if (actedAt) {
    items.push({ label: 'When', value: formatTime(actedAt) });
  }
  if (approvedBy) {
    items.push({ label: 'Approved by', value: approvedBy });
  }
  if (rejectedBy) {
    items.push({ label: 'Rejected by', value: rejectedBy });
  }

  return items;
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        STATUS_STYLES[status] ?? 'bg-white/[0.08] text-white/50',
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function PlatformPill({ platform }: { platform: string }) {
  return (
    <span className="inline-flex items-center rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
      {platform}
    </span>
  );
}

function ConversationRow({
  conversation,
  isSelected,
  onSelect,
}: {
  conversation: SocialConversationModel;
  isSelected: boolean;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      className={cn(
        'block w-full border-b border-white/[0.06] px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.035]',
      )}
      onClick={() => onSelect(conversation.id)}
    >
      <span className="mb-2 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-white/90">
          {getParticipantLabel(conversation)}
        </span>
        <span className="shrink-0 text-[11px] text-white/35">
          {formatTime(conversation.latestMessageAt)}
        </span>
      </span>
      <span className="mb-2 flex items-center gap-1.5">
        <PlatformPill platform={conversation.platform} />
        <StatusPill status={conversation.status} />
        {conversation.unreadCount > 0 ? (
          <span className="inline-flex items-center rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {conversation.unreadCount} unread
          </span>
        ) : null}
      </span>
      <span className="line-clamp-2 text-xs leading-relaxed text-white/48">
        {conversation.latestMessageText || 'No message preview available'}
      </span>
    </Button>
  );
}

function MessageBubble({
  busyAction,
  message,
  onApproveDraft,
  onRejectDraft,
}: {
  busyAction: string | null;
  message: SocialMessageModel;
  onApproveDraft: (messageId: string) => void;
  onRejectDraft: (messageId: string) => void;
}) {
  const isOutbound = message.direction === 'outbound';
  const isDraft = isOutbound && message.status === 'draft';
  const provenanceItems = getMessageProvenanceItems(message);

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded border px-3 py-2',
          isOutbound
            ? 'border-primary/20 bg-primary/10 text-primary-foreground'
            : 'border-white/[0.08] bg-white/[0.035] text-white/78',
        )}
      >
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/32">
          <span>{isOutbound ? 'Manager' : message.senderName || 'Sender'}</span>
          <span>{formatTime(message.createdAt)}</span>
          <span>{message.status}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.body}
        </p>
        {provenanceItems.length > 0 ? (
          <dl
            aria-label="Message provenance"
            className="mt-3 grid gap-1 border-t border-white/[0.08] pt-2 text-[11px] text-white/46"
          >
            {provenanceItems.map((item) => (
              <div className="flex min-w-0 gap-2" key={item.label}>
                <dt className="shrink-0 font-medium text-white/36">
                  {item.label}
                </dt>
                <dd className="min-w-0 truncate text-white/62">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {isDraft ? (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              isLoading={busyAction === `approve:${message.id}`}
              onClick={() => onApproveDraft(message.id)}
            >
              Approve
            </Button>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              isLoading={busyAction === `reject:${message.id}`}
              onClick={() => onRejectDraft(message.id)}
            >
              Reject
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { href } = useOrgUrl();
  const getMessagesService = useAuthedService((token: string) =>
    SocialMessagesService.getInstance(token),
  );

  const [conversations, setConversations] = useState<SocialConversationModel[]>(
    [],
  );
  const [messages, setMessages] = useState<SocialMessageModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform | 'all'>('all');
  const [status, setStatus] = useState<SocialConversationStatus | 'all'>(
    'open',
  );
  const [automationState, setAutomationState] = useState<
    SocialAutomationState | 'all'
  >('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [credentialId, setCredentialId] = useState('');
  const [assignedOwnerId, setAssignedOwnerId] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [busyAction, setBusyAction] = useState<
    | 'draft'
    | 'dm'
    | 'reply'
    | 'status'
    | 'sync'
    | `approve:${string}`
    | `reject:${string}`
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      limit: 50,
      ...(platform !== 'all' ? { platform } : {}),
      ...(status !== 'all' ? { status } : {}),
      ...(automationState !== 'all' ? { automationState } : {}),
      ...(unreadOnly ? { unread: true } : {}),
      ...(needsReviewOnly ? { needsReview: true } : {}),
      ...(credentialId.trim() ? { credentialId: credentialId.trim() } : {}),
      ...(assignedOwnerId.trim()
        ? { assignedOwnerId: assignedOwnerId.trim() }
        : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [
      assignedOwnerId,
      automationState,
      credentialId,
      needsReviewOnly,
      platform,
      search,
      status,
      unreadOnly,
    ],
  );

  const selectedConversation = useMemo(
    () =>
      selectedId
        ? conversations.find((conversation) => conversation.id === selectedId)
        : null,
    [conversations, selectedId],
  );

  const automationHref = useMemo(() => {
    if (!selectedConversation) {
      return href(APP_ROUTES.WORKFLOWS.NEW);
    }

    const params = new URLSearchParams({
      conversationId: selectedConversation.id,
      platform: String(selectedConversation.platform),
      source: 'messages',
      trigger: 'commentTrigger',
    });

    if (selectedConversation.sourceContentId) {
      params.set('sourceContentId', selectedConversation.sourceContentId);
    }
    if (selectedConversation.credentialId) {
      params.set('credentialId', selectedConversation.credentialId);
    }

    return href(`${APP_ROUTES.WORKFLOWS.NEW}?${params.toString()}`);
  }, [href, selectedConversation]);

  const loadConversations = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoadingConversations(true);
      setError(null);

      try {
        const service = await getMessagesService();
        const nextConversations = await service.list(query);
        if (signal?.aborted) {
          return;
        }

        setConversations(nextConversations);
        setSelectedId((current) => {
          if (
            current &&
            nextConversations.some(
              (conversation) => conversation.id === current,
            )
          ) {
            return current;
          }

          return nextConversations[0]?.id ?? null;
        });
      } catch (err: unknown) {
        if (!isAbortLike(err)) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoadingConversations(false);
        }
      }
    },
    [getMessagesService, query],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadConversations(controller.signal);
    return () => controller.abort();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    const controller = new AbortController();
    setIsLoadingMessages(true);
    setError(null);

    getMessagesService()
      .then((service) =>
        service.listMessages(selectedId, { limit: 100 }, controller.signal),
      )
      .then((nextMessages) => {
        if (!controller.signal.aborted) {
          setMessages(nextMessages);
        }
      })
      .catch((err: unknown) => {
        if (!isAbortLike(err)) {
          setError(getErrorMessage(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingMessages(false);
        }
      });

    return () => controller.abort();
  }, [getMessagesService, selectedId]);

  const refreshSelectedThread = useCallback(async () => {
    if (!selectedId) {
      return;
    }

    const service = await getMessagesService();
    const [nextConversations, nextMessages] = await Promise.all([
      service.list(query),
      service.listMessages(selectedId, { limit: 100 }),
    ]);
    setConversations(nextConversations);
    setMessages(nextMessages);
  }, [getMessagesService, query, selectedId]);

  const handleDraftChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(event.target.value);
    },
    [],
  );

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value);
    },
    [],
  );

  const handleAction = useCallback(
    async (action: 'draft' | 'dm' | 'reply') => {
      if (!selectedId || !draft.trim()) {
        return;
      }

      setBusyAction(action);
      setError(null);
      setNotice(null);

      try {
        const service = await getMessagesService();
        const idempotencyKey = `messages:${selectedId}:${action}:${Date.now()}`;
        const input = { idempotencyKey, text: draft.trim() };

        if (action === 'draft') {
          await service.createDraft(selectedId, {
            ...input,
            messageType: 'reply',
          });
          setNotice('Draft saved for review.');
        } else if (action === 'reply') {
          await service.postReply(selectedId, input);
          setNotice('Reply posted.');
        } else {
          await service.sendDm(selectedId, input);
          setNotice('DM sent.');
        }

        setDraft('');
        await refreshSelectedThread();
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setBusyAction(null);
      }
    },
    [draft, getMessagesService, refreshSelectedThread, selectedId],
  );

  const handleStatusChange = useCallback(
    async (nextStatus: SocialConversationStatus) => {
      if (!selectedId) {
        return;
      }

      setBusyAction('status');
      setError(null);

      try {
        const service = await getMessagesService();
        await service.updateStatus(selectedId, nextStatus);
        await loadConversations();
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setBusyAction(null);
      }
    },
    [getMessagesService, loadConversations, selectedId],
  );

  const handleSyncYoutube = useCallback(async () => {
    setBusyAction('sync');
    setError(null);
    setNotice(null);

    try {
      const service = await getMessagesService();
      await service.syncYoutube();
      setNotice(
        'YouTube sync started. New comments will appear here once the background job finishes.',
      );
      await loadConversations();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  }, [getMessagesService, loadConversations]);

  const handleApproveDraft = useCallback(
    async (messageId: string) => {
      if (!selectedId) {
        return;
      }

      setBusyAction(`approve:${messageId}`);
      setError(null);
      setNotice(null);

      try {
        const service = await getMessagesService();
        await service.approveDraft(selectedId, messageId);
        setNotice('Draft approved and published.');
        await refreshSelectedThread();
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setBusyAction(null);
      }
    },
    [getMessagesService, refreshSelectedThread, selectedId],
  );

  const handleRejectDraft = useCallback(
    async (messageId: string) => {
      if (!selectedId) {
        return;
      }

      setBusyAction(`reject:${messageId}`);
      setError(null);
      setNotice(null);

      try {
        const service = await getMessagesService();
        await service.rejectDraft(selectedId, messageId);
        setNotice('Draft rejected.');
        await refreshSelectedThread();
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setBusyAction(null);
      }
    },
    [getMessagesService, refreshSelectedThread, selectedId],
  );

  const availability = selectedConversation?.availability ?? {
    canPostReply: false,
    canSendDm: false,
    postReplyReason: 'Select a conversation before replying.',
    sendDmReason: 'Select a conversation before sending a DM.',
  };

  return (
    <Container>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Messages</h1>
          <p className="mt-1 text-sm text-white/42">
            Social comments, replies, and supported direct messages.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            icon={<HiOutlineArrowPath className="size-4" />}
            isLoading={busyAction === 'sync'}
            onClick={handleSyncYoutube}
          >
            Sync YouTube
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-[minmax(200px,1fr)_180px_180px_180px_140px]">
        <Input
          placeholder="Search people, handles, content"
          value={search}
          onChange={handleSearchChange}
        />
        <Select
          value={platform}
          onValueChange={(value) =>
            setPlatform(value as SocialPlatform | 'all')
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) =>
            setStatus(value as SocialConversationStatus | 'all')
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={automationState}
          onValueChange={(value) =>
            setAutomationState(value as SocialAutomationState | 'all')
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Automation" />
          </SelectTrigger>
          <SelectContent>
            {AUTOMATION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={unreadOnly ? 'unread' : 'all'}
          onValueChange={(value) => setUnreadOnly(value === 'unread')}
        >
          <SelectTrigger>
            <SelectValue placeholder="Unread" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_160px]">
        <Input
          placeholder="Credential/account ID"
          value={credentialId}
          onChange={(event) => setCredentialId(event.target.value)}
        />
        <Input
          placeholder="Assigned owner ID"
          value={assignedOwnerId}
          onChange={(event) => setAssignedOwnerId(event.target.value)}
        />
        <Select
          value={needsReviewOnly ? 'needs-review' : 'all'}
          onValueChange={(value) =>
            setNeedsReviewOnly(value === 'needs-review')
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Review" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Review</SelectItem>
            <SelectItem value="needs-review">Needs Review</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="mb-4 rounded border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
        </div>
      ) : null}

      <div className="grid min-h-[680px] overflow-hidden rounded bg-card shadow-border lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="border-b border-white/[0.08] lg:border-b-0 lg:border-r">
          <div className="flex h-12 items-center justify-between border-b border-white/[0.08] px-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white/76">
              <HiOutlineInboxStack className="size-4 text-white/38" />
              Conversations
            </div>
            <span className="text-xs text-white/32">
              {conversations.length}
            </span>
          </div>
          <div className="max-h-[628px] overflow-y-auto">
            {isLoadingConversations ? (
              <div className="p-4">
                <LazyLoadingFallback variant="minimal" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center px-6 text-center">
                <HiOutlineChatBubbleLeftRight className="mb-3 size-8 text-white/20" />
                <p className="text-sm text-white/50">No messages found</p>
                <p className="mt-1 text-xs text-white/30">
                  New social conversations will appear here after sync.
                </p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <ConversationRow
                  conversation={conversation}
                  isSelected={conversation.id === selectedId}
                  key={conversation.id}
                  onSelect={setSelectedId}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          {selectedConversation ? (
            <>
              <div className="border-b border-white/[0.08] px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <PlatformPill platform={selectedConversation.platform} />
                      <StatusPill status={selectedConversation.status} />
                      {selectedConversation.needsReview ? (
                        <span className="inline-flex items-center rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                          Review
                        </span>
                      ) : null}
                    </div>
                    <h2 className="truncate text-base font-semibold text-white">
                      {getParticipantLabel(selectedConversation)}
                    </h2>
                    <p className="mt-1 truncate text-xs text-white/38">
                      {selectedConversation.sourceContentTitle ||
                        selectedConversation.sourceContentUrl ||
                        selectedConversation.externalConversationId}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      asChild
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                    >
                      <Link href={automationHref}>
                        <HiOutlineBolt className="size-4" />
                        Automation
                      </Link>
                    </Button>
                    <Button
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                      icon={<HiOutlineCheckCircle className="size-4" />}
                      isLoading={busyAction === 'status'}
                      onClick={() => handleStatusChange('resolved')}
                    >
                      Resolve
                    </Button>
                    <Button
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                      isLoading={busyAction === 'status'}
                      onClick={() => handleStatusChange('open')}
                    >
                      Reopen
                    </Button>
                    <Button
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                      isLoading={busyAction === 'status'}
                      onClick={() => handleStatusChange('needs_review')}
                    >
                      Needs Review
                    </Button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {isLoadingMessages ? (
                  <LazyLoadingFallback variant="minimal" />
                ) : messages.length === 0 ? (
                  <div className="flex h-full min-h-64 items-center justify-center text-sm text-white/42">
                    No messages in this thread yet.
                  </div>
                ) : (
                  messages.map((message) => (
                    <MessageBubble
                      busyAction={busyAction}
                      key={message.id}
                      message={message}
                      onApproveDraft={handleApproveDraft}
                      onRejectDraft={handleRejectDraft}
                    />
                  ))
                )}
              </div>

              <div className="border-t border-white/[0.08] p-4">
                <Textarea
                  className="min-h-24 w-full"
                  placeholder="Write a reply or DM"
                  rows={4}
                  value={draft}
                  onChange={handleDraftChange}
                />
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-white/36">
                    {availability.canSendDm
                      ? 'DM is available for this thread.'
                      : availability.sendDmReason}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                      isDisabled={!draft.trim()}
                      isLoading={busyAction === 'draft'}
                      onClick={() => handleAction('draft')}
                    >
                      Save Draft
                    </Button>
                    <Button
                      variant={ButtonVariant.DEFAULT}
                      size={ButtonSize.SM}
                      icon={<HiOutlinePaperAirplane className="size-4" />}
                      isDisabled={!draft.trim() || !availability.canPostReply}
                      isLoading={busyAction === 'reply'}
                      title={availability.postReplyReason}
                      onClick={() => handleAction('reply')}
                    >
                      Reply
                    </Button>
                    <Button
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                      isDisabled={!draft.trim() || !availability.canSendDm}
                      isLoading={busyAction === 'dm'}
                      title={availability.sendDmReason}
                      onClick={() => handleAction('dm')}
                    >
                      DM
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[680px] flex-col items-center justify-center px-6 text-center">
              <HiOutlineChatBubbleLeftRight className="mb-3 size-10 text-white/20" />
              <p className="text-sm text-white/50">Select a conversation</p>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
