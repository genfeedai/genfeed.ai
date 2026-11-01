'use client';

import { getThreadStatusMeta } from '@genfeedai/agent/components/agent-thread-list.helpers';
import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { Video } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { AgentThreadLightViewProps } from '@/components/workspace-shell/props/agent-threads-panel.props';
import { collectThreadAssets } from './agent-thread-assets.util';

const MESSAGE_LIMIT = 20;

type SteerState = 'idle' | 'sending' | 'sent' | 'failed';

/**
 * A thread seen from the master's Threads panel: its last messages and a box to
 * steer it, without leaving the page or changing the conversation on the left.
 */
export default function AgentThreadLightView({
  apiService,
  isPending = false,
  isResolved = false,
  onBack,
  isStartedByMaster = false,
  onOpenFullThread,
  onReopen,
  onResolve,
  thread,
}: AgentThreadLightViewProps) {
  const translate = useTranslations('common.agentThreads');
  const steerId = useId();
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [steerState, setSteerState] = useState<SteerState>('idle');

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

  const handleSteer = useCallback(async () => {
    const content = draft.trim();
    if (!content || steerState === 'sending' || isResolved) {
      return;
    }

    setSteerState('sending');
    try {
      await apiService.chatStream({
        clientRequestId: crypto.randomUUID(),
        content,
        expectedContextVersion: thread.contextVersion,
        source: 'agent',
        threadId: thread.id,
      });
      setDraft('');
      setSteerState('sent');
      void loadMessages(new AbortController().signal);
    } catch {
      setSteerState('failed');
    }
  }, [
    apiService,
    draft,
    isResolved,
    loadMessages,
    steerState,
    thread.contextVersion,
    thread.id,
  ]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="agent-thread-light-view"
    >
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button
          onClick={onBack}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          {translate('back')}
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {thread.title?.trim() || translate('untitled')}
        </p>
        {isResolved ? (
          <Badge data-testid="agent-thread-resolved" variant="success">
            {translate('resolved')}
          </Badge>
        ) : null}
        {isResolved ? (
          onReopen ? (
            <Button
              isDisabled={isPending}
              onClick={onReopen}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              {translate('reopen')}
            </Button>
          ) : null
        ) : onResolve ? (
          <Button
            isDisabled={isPending}
            onClick={onResolve}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {translate('resolve')}
          </Button>
        ) : null}
        {onOpenFullThread ? (
          <Button
            onClick={() => onOpenFullThread(thread.id)}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {translate('openFull')}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span data-testid="agent-thread-status">
          {status?.label ?? translate('statusIdle')}
        </span>
        {isStartedByMaster ? (
          <span data-testid="agent-thread-started-by">
            {translate('startedByMaster')}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
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
          messages.map((message) => (
            <div
              className="space-y-1"
              data-testid={`agent-thread-message-${message.id}`}
              key={message.id}
            >
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {message.role === 'user'
                  ? translate('roleYou')
                  : translate('roleAgent')}
              </p>
              <p className="line-clamp-6 whitespace-pre-wrap text-sm">
                {message.content}
              </p>
            </div>
          ))
        )}
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

      <div className="space-y-2 border-t border-border p-3">
        <Textarea
          aria-label={translate('steerLabel')}
          id={steerId}
          isDisabled={steerState === 'sending' || isResolved}
          onChange={(event) => {
            setDraft(event.target.value);
            if (steerState !== 'sending') {
              setSteerState('idle');
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void handleSteer();
            }
          }}
          placeholder={translate('steerPlaceholder')}
          rows={2}
          value={draft}
        />
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-xs text-muted-foreground"
            role={steerState === 'failed' ? 'alert' : 'status'}
          >
            {isResolved
              ? translate('reopenToSteer')
              : steerState === 'sent'
                ? translate('steerSent')
                : steerState === 'failed'
                  ? translate('steerFailed')
                  : ''}
          </p>
          <Button
            isDisabled={!draft.trim() || steerState === 'sending' || isResolved}
            onClick={() => void handleSteer()}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          >
            {translate('steer')}
          </Button>
        </div>
      </div>
    </div>
  );
}
