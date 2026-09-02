'use client';

import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { ArrowUp, ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

type ComposerFollowUpQueueProps = {
  isBusy?: boolean;
  isInterrupting?: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  onSendNow: (id: string) => void;
  queue: readonly ComposerFollowUp[];
};

export function ComposerFollowUpQueue({
  isBusy = false,
  isInterrupting = false,
  onMove,
  onRemove,
  onRetry,
  onSendNow,
  queue,
}: ComposerFollowUpQueueProps): ReactElement | null {
  const translate = useTranslations('common.agent.composerFollowUpQueue');
  const [isExpanded, setIsExpanded] = useState(true);
  if (queue.length === 0) {
    return null;
  }

  const queueState = isInterrupting
    ? 'interrupting'
    : queue.some((item) => item.status === 'failed')
      ? 'dispatch-failed'
      : isBusy
        ? 'generating-queued'
        : 'idle';

  return (
    <div
      aria-label={translate('count', { count: queue.length })}
      aria-live="polite"
      className="mb-1.5 rounded-lg border border-border/70 bg-background-secondary/90 px-1.5 py-1"
      data-queue-state={queueState}
      data-testid="composer-follow-up-queue"
      role="region"
    >
      <div className="flex min-w-0 items-center gap-1 px-1 py-0.5">
        <p className="min-w-0 flex-1 truncate text-2xs font-medium uppercase tracking-wide text-foreground/45">
          {translate('count', { count: queue.length })}
          {isBusy ? ` · ${translate('sendNowHint')}` : null}
        </p>
        <Button
          ariaLabel={isExpanded ? translate('collapse') : translate('expand')}
          className="size-7 shrink-0 p-0"
          icon={
            isExpanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )
          }
          onClick={() => setIsExpanded((current) => !current)}
          size={ButtonSize.ICON}
          tooltip={isExpanded ? translate('collapse') : translate('expand')}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>
      {isExpanded ? (
        <ol className="flex flex-col gap-px">
          {queue.map((item, index) => {
            const status = item.status ?? 'queued';
            const isSending = status === 'sending';
            const isFailed = status === 'failed';
            const isActionDisabled = isInterrupting || isSending;
            return (
              <li
                className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 hover:bg-foreground/5"
                data-follow-up-status={status}
                key={item.id}
              >
                <p className="min-w-0 flex-1 truncate px-1 text-xs leading-5 text-foreground/80">
                  {item.content}
                  {isSending ? ` · ${translate('sending')}` : null}
                  {isFailed ? ` · ${translate('failed')}` : null}
                </p>
                <Button
                  ariaLabel={translate('moveUp')}
                  className="size-7 shrink-0 p-0"
                  icon={<ChevronUp className="size-3.5" />}
                  isDisabled={isActionDisabled || index === 0}
                  onClick={() => onMove(index, index - 1)}
                  size={ButtonSize.ICON}
                  tooltip={translate('moveUp')}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
                <Button
                  ariaLabel={translate('moveDown')}
                  className="size-7 shrink-0 p-0"
                  icon={<ChevronDown className="size-3.5" />}
                  isDisabled={isActionDisabled || index === queue.length - 1}
                  onClick={() => onMove(index, index + 1)}
                  size={ButtonSize.ICON}
                  tooltip={translate('moveDown')}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
                {isFailed && onRetry ? (
                  <Button
                    ariaLabel={translate('retry')}
                    className="size-7 shrink-0 p-0"
                    icon={<RefreshCw className="size-3.5" />}
                    isDisabled={isInterrupting}
                    onClick={() => onRetry(item.id)}
                    size={ButtonSize.ICON}
                    tooltip={translate('retry')}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                ) : (
                  <Button
                    ariaLabel={translate('sendNow')}
                    className="size-7 shrink-0 p-0"
                    icon={<ArrowUp className="size-3.5" />}
                    isDisabled={isActionDisabled}
                    onClick={() => onSendNow(item.id)}
                    size={ButtonSize.ICON}
                    tooltip={translate('sendNow')}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                )}
                <Button
                  ariaLabel={translate('remove')}
                  className="size-7 shrink-0 p-0"
                  icon={<X className="size-3.5" />}
                  isDisabled={isSending}
                  onClick={() => onRemove(item.id)}
                  size={ButtonSize.ICON}
                  tooltip={translate('remove')}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
