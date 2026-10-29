'use client';

import type { AgentChatMessage } from '@genfeedai/agent';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentThreadLightViewProps } from '@props/ui/agent-threads-panel.props';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useState } from 'react';

const MESSAGE_LIMIT = 20;

type SteerState = 'idle' | 'sending' | 'sent' | 'failed';

/**
 * A thread seen from the master's Threads panel: its last messages and a box to
 * steer it, without leaving the page or changing the conversation on the left.
 */
export default function AgentThreadLightView({
  apiService,
  onBack,
  onOpenFullThread,
  thread,
}: AgentThreadLightViewProps) {
  const translate = useTranslations('common.agentThreads');
  const steerId = useId();
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [steerState, setSteerState] = useState<SteerState>('idle');

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
    if (!content || steerState === 'sending') {
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

      <div className="space-y-2 border-t border-border p-3">
        <Textarea
          aria-label={translate('steerLabel')}
          id={steerId}
          isDisabled={steerState === 'sending'}
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
            {steerState === 'sent'
              ? translate('steerSent')
              : steerState === 'failed'
                ? translate('steerFailed')
                : ''}
          </p>
          <Button
            isDisabled={!draft.trim() || steerState === 'sending'}
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
