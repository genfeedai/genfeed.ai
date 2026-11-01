'use client';

import { AgentChatInput } from '@genfeedai/agent/components/AgentChatInput';
import { AgentChatMessage } from '@genfeedai/agent/components/AgentChatMessage';
import { getThreadStatusMeta } from '@genfeedai/agent/components/agent-thread-list.helpers';
import {
  AGENT_CONVERSATION_SCROLL_CLASS,
  AGENT_CONVERSATION_TRACK_CLASS,
} from '@genfeedai/agent/constants/conversation-layout.constant';
import type { AgentChatMessage as AgentChatMessageModel } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Button } from '@ui/primitives/button';
import {
  ArchiveRestore,
  CheckCheck,
  ChevronRight,
  Expand,
  Video,
} from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentThreadLightViewProps } from '@/components/workspace-shell/props/agent-threads-panel.props';
import { collectThreadAssets } from './agent-thread-assets.util';

const MESSAGE_LIMIT = 20;

/**
 * A thread seen from the master's Threads panel, laid out like the master
 * conversation beside it: the same messages, the same prompt bar anchored at
 * the foot. One slim header names the thread and holds its actions.
 */
export default function AgentThreadLightView({
  apiService,
  isPending = false,
  isResolved = false,
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

  const status = getThreadStatusMeta(thread);
  const assets = useMemo(
    () => collectThreadAssets(thread, messages),
    [messages, thread],
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
        <div
          className={cn(AGENT_CONVERSATION_TRACK_CLASS, 'grow space-y-1 pt-4')}
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
                isReadOnly={isResolved}
                key={message.id}
                message={message}
                messageIndex={index}
              />
            ))
          )}
        </div>
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
                  hasSteerFailed ? 'text-destructive' : 'text-muted-foreground',
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
            placeholder={translate('steerPlaceholder')}
          />
        </PromptBarContainer>
      </div>
    </div>
  );
}
