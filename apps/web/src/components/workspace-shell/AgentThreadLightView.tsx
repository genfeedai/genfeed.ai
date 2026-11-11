'use client';

import { AgentChatInput } from '@genfeedai/agent/components/AgentChatInput';
import { AgentChatMessage } from '@genfeedai/agent/components/AgentChatMessage';
import {
  type AgentHandoffActions,
  AgentHandoffProvider,
} from '@genfeedai/agent/components/AgentHandoffContext';
import {
  AgentPlanCard,
  type AgentPlanDecision,
} from '@genfeedai/agent/components/AgentPlanCard';
import { getThreadStatusMeta } from '@genfeedai/agent/components/agent-thread-list.helpers';
import {
  AGENT_CONVERSATION_SCROLL_CLASS,
  AGENT_CONVERSATION_TRACK_CLASS,
} from '@genfeedai/agent/constants/conversation-layout.constant';
import type {
  AgentChatMessage as AgentChatMessageModel,
  AgentThreadShare,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { deriveLatestProposedPlan } from '@genfeedai/agent/utils/resolve-latest-proposed-plan.util';
import {
  AgentThreadAccessLevel,
  AgentThreadShareScope,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  ArchiveRestore,
  CheckCheck,
  ChevronRight,
  Ellipsis,
  Expand,
  Forward,
  Lock,
  Users,
  Video,
} from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AgentThreadHandoffDialog from '@/components/workspace-shell/AgentThreadHandoffDialog';
import AgentThreadShareDialog from '@/components/workspace-shell/AgentThreadShareDialog';
import type {
  AgentThreadLightViewProps,
  AgentThreadMember,
} from '@/components/workspace-shell/props/agent-threads-panel.props';
import { collectThreadAssets } from './agent-thread-assets.util';

const MESSAGE_LIMIT = 20;
// While the thread runs, its transcript is re-read this often so the work
// shows up here as it lands instead of only after a reload.
const RUNNING_REFRESH_MS = 4000;
const NO_MEMBERS: AgentThreadMember[] = [];
const NO_MEMBERS_BY_ID: ReadonlyMap<string, AgentThreadMember> = new Map();
const NO_SHARES: AgentThreadShare[] = [];

function resolveAuthor(
  member: AgentThreadMember | undefined,
): { avatarUrl: string | null; name: string } | undefined {
  return member
    ? { avatarUrl: member.avatarUrl, name: member.name }
    : undefined;
}

/**
 * A thread seen from the master's Threads panel, laid out like the master
 * conversation beside it: the same messages, the same prompt bar anchored at
 * the foot. One slim header names the thread and holds its actions.
 */
export default function AgentThreadLightView({
  apiService,
  isPending = false,
  isResolved = false,
  members = NO_MEMBERS,
  membersById = NO_MEMBERS_BY_ID,
  onBack,
  onOpenFullThread,
  onReopen,
  onResolve,
  thread,
}: AgentThreadLightViewProps) {
  const translate = useTranslations('common.agentThreads');
  const [messages, setMessages] = useState<AgentChatMessageModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasSteerFailed, setHasSteerFailed] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);
  const [hasDecisionFailed, setHasDecisionFailed] = useState(false);
  // The plan this view just approved or sent back. Its card stops offering a
  // decision at once, before the reloaded messages show the plan's new state.
  const [decidedPlan, setDecidedPlan] = useState<{
    action: 'approve_plan' | 'revise_plan';
    id: string;
  } | null>(null);
  const decidedPlanId = decidedPlan?.id ?? null;
  const updateThread = useAgentChatStore((state) => state.updateThread);
  const [shares, setShares] = useState<AgentThreadShare[]>(NO_SHARES);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHandoffOpen, setIsHandoffOpen] = useState(false);
  const [handoffTo, setHandoffTo] = useState<string | null>(null);
  const canManageShares = thread.canManageShares === true;
  // The viewer's own level: anything but a share reads as owner, which is how
  // an older API answered before sharing existed.
  const accessLevel = thread.accessLevel ?? AgentThreadAccessLevel.OWNER;
  const isOwnThread = accessLevel === AgentThreadAccessLevel.OWNER;
  const canPrompt = accessLevel !== AgentThreadAccessLevel.VIEW;
  const ownerName = thread.userId
    ? membersById.get(thread.userId)?.name
    : undefined;

  const status = getThreadStatusMeta(thread);
  const assets = useMemo(
    () => collectThreadAssets(thread, messages),
    [messages, thread],
  );
  const latestPlan = useMemo(
    () =>
      deriveLatestProposedPlan(
        messages.map((message) => message.metadata?.proposedPlan),
      ),
    [messages],
  );

  const loadMessages = useCallback(
    (signal: AbortSignal) => {
      setIsLoading(true);
      setHasLoadFailed(false);
      return apiService
        .getMessages(thread.id, { limit: MESSAGE_LIMIT }, signal)
        .then((loaded) => {
          if (!signal.aborted) {
            setMessages(loaded);
          }
        })
        .catch(() => {
          if (!signal.aborted) {
            setHasLoadFailed(true);
          }
        })
        .finally(() => {
          if (!signal.aborted) {
            setIsLoading(false);
          }
        });
    },
    [apiService, thread.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadMessages(controller.signal);
    return () => controller.abort();
  }, [loadMessages]);

  // What a hand-off card needs: answer the request, and name the teammate.
  // Answering reloads the thread so the run it starts shows up here.
  const handoffActions = useMemo<AgentHandoffActions>(
    () => ({
      accept: async (transferId) => {
        const transfer = await apiService.acceptAgentTransfer(transferId);
        void loadMessages(new AbortController().signal);
        return transfer;
      },
      decline: (transferId) => apiService.declineAgentTransfer(transferId),
      nameOf: (userId) => membersById.get(userId)?.name,
    }),
    [apiService, loadMessages, membersById],
  );

  // Who the thread is shared with. Only the owner (or an admin) may read it.
  useEffect(() => {
    if (!canManageShares) {
      setShares(NO_SHARES);
      return;
    }
    const controller = new AbortController();
    apiService
      .getThreadShares(thread.id, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setShares(loaded);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setShares(NO_SHARES);
        }
      });
    return () => controller.abort();
  }, [apiService, canManageShares, thread.id]);

  // A running thread (for example right after its plan was approved) shows
  // its new messages as they land, and once more when the run settles.
  const isWorking = status?.tone === 'running';
  const wasWorkingRef = useRef(isWorking);
  useEffect(() => {
    const controller = new AbortController();
    if (wasWorkingRef.current && !isWorking) {
      void loadMessages(controller.signal);
    }
    wasWorkingRef.current = isWorking;
    if (!isWorking) {
      return () => controller.abort();
    }
    const intervalId = window.setInterval(() => {
      void loadMessages(controller.signal);
    }, RUNNING_REFRESH_MS);
    return () => {
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [isWorking, loadMessages]);

  // The composer clears itself once this resolves; a rejection keeps the draft.
  const handleSteer = useCallback(
    async (content: string) => {
      setIsSending(true);
      setHasSteerFailed(false);
      try {
        await apiService.chatStream({
          clientRequestId: crypto.randomUUID(),
          content,
          expectedContextVersion: thread.contextVersion,
          source: 'agent',
          threadId: thread.id,
        });
        void loadMessages(new AbortController().signal);
        return true;
      } catch (error) {
        setHasSteerFailed(true);
        throw error;
      } finally {
        setIsSending(false);
      }
    },
    [apiService, loadMessages, thread.contextVersion, thread.id],
  );

  // A plan is approved in its own thread, so the decision is the same ui
  // action the full thread sends. The thread moves to Working in the shared
  // store, which the queue and the master's cards both read.
  const decidePlan = useCallback(
    async (
      action: 'approve_plan' | 'revise_plan',
      payload: Record<string, unknown>,
    ): Promise<boolean> => {
      if (!latestPlan) {
        return false;
      }
      setIsDeciding(true);
      setHasDecisionFailed(false);
      try {
        await apiService.respondToUiAction(
          thread.id,
          action,
          { planId: latestPlan.id, ...payload },
          undefined,
          {
            brandId: thread.brandId ?? null,
            expectedContextVersion: thread.contextVersion,
          },
        );
        setDecidedPlan({ action, id: latestPlan.id });
        updateThread(thread.id, {
          attentionState: 'running',
          pendingInputCount: 0,
          runStatus: 'queued',
          runtimeState: 'running',
        });
        void loadMessages(new AbortController().signal);
        return true;
      } catch {
        setHasDecisionFailed(true);
        return false;
      } finally {
        setIsDeciding(false);
      }
    },
    [
      apiService,
      latestPlan,
      loadMessages,
      thread.brandId,
      thread.contextVersion,
      thread.id,
      updateThread,
    ],
  );

  const planDecision: AgentPlanDecision | undefined =
    latestPlan && !isResolved && latestPlan.id !== decidedPlanId
      ? {
          isBusy: isDeciding,
          onApprove: async () => {
            await decidePlan('approve_plan', {});
          },
          onRequestChanges: (revisionNote) =>
            decidePlan('revise_plan', { revisionNote }),
        }
      : undefined;

  // Approved here, the card reads Approved at once; the reloaded transcript
  // catches up with the same state once the run records it.
  const displayedPlan =
    latestPlan &&
    decidedPlan?.action === 'approve_plan' &&
    decidedPlan.id === latestPlan.id &&
    latestPlan.status === 'awaiting_approval'
      ? { ...latestPlan, status: 'approved' as const }
      : latestPlan;

  // A thread with one author names no one; once a second member has written
  // in it (or it is shared), each member's turn names its
  // author.
  const authorIds = useMemo(
    () =>
      new Set(
        messages
          .filter((message) => message.role === 'user' && message.userId)
          .map((message) => message.userId),
      ),
    [messages],
  );
  const isShared = shares.length > 0;
  const isMultiAuthor = authorIds.size > 1 || !isOwnThread || isShared;
  const participants = useMemo(() => {
    const ids = new Set<string>(
      [
        thread.userId,
        ...shares
          .filter((share) => share.scope === AgentThreadShareScope.MEMBER)
          .map((share) => share.targetUserId),
        ...authorIds,
      ].filter((id): id is string => Boolean(id)),
    );
    return [...ids]
      .map((id) => membersById.get(id))
      .filter((member): member is AgentThreadMember => Boolean(member));
  }, [authorIds, membersById, shares, thread.userId]);
  const shareScopeLabel = (() => {
    if (shares.some((s) => s.scope === AgentThreadShareScope.ORGANIZATION)) {
      return translate('share.scopeOrganization');
    }
    if (shares.some((s) => s.scope === AgentThreadShareScope.BRAND)) {
      return thread.brandLabel?.trim() || translate('share.scopeBrand');
    }
    return shares.length > 0
      ? translate('share.scopePeople', { count: shares.length })
      : translate('share.scopePrivate');
  })();

  const title = thread.title?.trim() || translate('untitled');
  const toggleLabel = translate(isResolved ? 'reopen' : 'resolve');
  const onToggleResolved = isResolved ? onReopen : onResolve;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="agent-thread-light-view"
    >
      <header className="flex min-h-12 shrink-0 items-center gap-1 border-b border-border px-4">
        <nav
          aria-label={translate('breadcrumb')}
          className="flex min-w-0 flex-1 items-center gap-1 text-sm"
        >
          <Button
            onClick={onBack}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {translate('threads')}
          </Button>
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <h2 className="min-w-0 truncate font-medium text-foreground">
            {title}
          </h2>
          <span
            className="shrink-0 pl-2 text-xs text-muted-foreground"
            data-testid="agent-thread-status"
          >
            {isResolved
              ? translate('resolved')
              : (status?.label ?? translate('statusIdle'))}
          </span>
        </nav>
        {canManageShares ? (
          <>
            {isShared && participants.length > 1 ? (
              <div
                className="flex items-center gap-1"
                data-testid="agent-thread-participants"
              >
                {participants.map((member) => (
                  <Avatar
                    key={member.userId}
                    name={member.name}
                    size="sm"
                    src={member.avatarUrl}
                  />
                ))}
              </div>
            ) : null}
            <Button
              data-testid="agent-thread-share-button"
              onClick={() => setIsShareOpen(true)}
              size={ButtonSize.SM}
              textTransform="none"
              variant={ButtonVariant.SECONDARY}
            >
              {isShared ? (
                <Users className="size-4" />
              ) : (
                <Lock className="size-4" />
              )}
              {shareScopeLabel}
            </Button>
          </>
        ) : !isOwnThread ? (
          <Badge data-testid="agent-thread-access-badge" variant="secondary">
            {ownerName
              ? translate('share.accessBadge', {
                  level: translate(
                    canPrompt ? 'share.canPrompt' : 'share.canView',
                  ),
                  owner: ownerName,
                })
              : translate(canPrompt ? 'share.canPrompt' : 'share.canView')}
          </Badge>
        ) : null}
        {isOwnThread ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ariaLabel={translate('moreActions')}
                data-testid="agent-thread-more"
                icon={<Ellipsis className="size-4" />}
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={() => setIsHandoffOpen(true)}>
                <Forward className="size-4" />
                {translate('handoff.action')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onToggleResolved ? (
          <Button
            ariaLabel={toggleLabel}
            data-testid="agent-thread-toggle-resolved"
            icon={
              isResolved ? (
                <ArchiveRestore className="size-4" />
              ) : (
                <CheckCheck className="size-4" />
              )
            }
            isDisabled={isPending}
            onClick={onToggleResolved}
            size={ButtonSize.ICON}
            tooltip={toggleLabel}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : null}
        {onOpenFullThread ? (
          <Button
            ariaLabel={translate('openFull')}
            icon={<Expand className="size-4" />}
            onClick={() => onOpenFullThread(thread.id)}
            size={ButtonSize.ICON}
            tooltip={translate('openFull')}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : null}
      </header>

      <div className={AGENT_CONVERSATION_SCROLL_CLASS}>
        <AgentHandoffProvider value={handoffActions}>
          <div
            className={cn(
              AGENT_CONVERSATION_TRACK_CLASS,
              'grow space-y-1 pt-4',
            )}
          >
            {isLoading && messages.length === 0 ? (
              <p className="text-sm text-muted-foreground" role="status">
                {translate('loadingMessages')}
              </p>
            ) : hasLoadFailed ? (
              <p className="text-sm text-destructive" role="alert">
                {translate('loadFailed')}
              </p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {translate('noMessages')}
              </p>
            ) : (
              messages.map((message, index) => (
                <AgentChatMessage
                  author={
                    isMultiAuthor &&
                    message.role === 'user' &&
                    message.userId &&
                    (index === 0 ||
                      messages[index - 1]?.userId !== message.userId ||
                      messages[index - 1]?.role !== 'user')
                      ? resolveAuthor(membersById.get(message.userId))
                      : undefined
                  }
                  isReadOnly={isResolved}
                  key={message.id}
                  message={message}
                  messageIndex={index}
                />
              ))
            )}
            {displayedPlan ? (
              <AgentPlanCard decision={planDecision} plan={displayedPlan} />
            ) : null}
            {hasDecisionFailed ? (
              <p className="text-sm text-destructive" role="alert">
                {translate('planDecisionFailed')}
              </p>
            ) : null}
            {handoffTo ? (
              <p
                className="text-center text-xs text-muted-foreground"
                data-testid="agent-thread-handoff-sent"
                role="status"
              >
                {translate('handoff.sent', { name: handoffTo })}
              </p>
            ) : null}
          </div>
        </AgentHandoffProvider>
      </div>

      {assets.length > 0 ? (
        <ul
          aria-label={translate('outputs')}
          className="flex flex-wrap gap-2 border-t border-border p-3"
          data-testid="agent-thread-assets"
        >
          {assets.map((asset) => (
            <li key={asset.url}>
              <a
                aria-label={translate('openOutput')}
                className="relative flex size-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted"
                href={asset.url}
                rel="noreferrer"
                target="_blank"
              >
                {asset.kind === 'image' ? (
                  <Image
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                    height={64}
                    src={asset.url}
                    unoptimized
                    width={64}
                  />
                ) : (
                  <Video aria-hidden="true" className="size-5" />
                )}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {!canPrompt ? (
        <p
          className="shrink-0 px-6 pb-4 text-xs text-muted-foreground"
          data-testid="agent-thread-view-only"
        >
          {ownerName
            ? translate('share.viewOnlyNamed', { owner: ownerName })
            : translate('share.viewOnly')}
        </p>
      ) : (
        <div className="shrink-0 px-4 pb-4">
          <PromptBarContainer
            className="mx-auto w-full max-w-3xl"
            layoutMode="inflow"
            maxWidth="full"
            topContent={
              isResolved || hasSteerFailed ? (
                <p
                  className={cn(
                    'mb-2 text-xs',
                    hasSteerFailed
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                  role={hasSteerFailed ? 'alert' : 'status'}
                >
                  {hasSteerFailed
                    ? translate('steerFailed')
                    : translate('reopenToSteer')}
                </p>
              ) : undefined
            }
          >
            <AgentChatInput
              disabled={isSending || isResolved}
              isAgentControlsHidden
              key={thread.id}
              onSend={handleSteer}
              placeholder={translate(
                isMultiAuthor
                  ? 'share.steerPlaceholderShared'
                  : 'steerPlaceholder',
              )}
            />
          </PromptBarContainer>
        </div>
      )}
      {isOwnThread ? (
        <AgentThreadHandoffDialog
          apiService={apiService}
          isOpen={isHandoffOpen}
          members={members}
          onOpenChange={setIsHandoffOpen}
          onSent={(name) => {
            setHandoffTo(name);
            void loadMessages(new AbortController().signal);
          }}
          thread={thread}
        />
      ) : null}
      {canManageShares ? (
        <AgentThreadShareDialog
          apiService={apiService}
          isOpen={isShareOpen}
          members={members}
          onOpenChange={setIsShareOpen}
          onSharesChange={setShares}
          shares={shares}
          thread={thread}
        />
      ) : null}
    </div>
  );
}
