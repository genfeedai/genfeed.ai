'use client';

import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { ArrowUp, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

type ComposerFollowUpQueueProps = {
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
  queue: readonly ComposerFollowUp[];
};

export function ComposerFollowUpQueue({
  onMove,
  onRemove,
  onSendNow,
  queue,
}: ComposerFollowUpQueueProps): ReactElement | null {
  const translate = useTranslations('common.agent.composerFollowUpQueue');
  if (queue.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-1.5 rounded-lg border border-border/70 bg-background-secondary/90 px-1.5 py-1"
      data-testid="composer-follow-up-queue"
    >
      <p className="px-1.5 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-foreground/45">
        {translate('queued')}
      </p>
      <ul className="flex flex-col gap-px">
        {queue.map((item, index) => (
          <li
            className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 hover:bg-white/5"
            key={item.id}
          >
            <p className="min-w-0 flex-1 truncate px-1 text-[12px] leading-5 text-foreground/80">
              {item.content}
            </p>
            <Button
              ariaLabel="Move follow-up up"
              className="size-7 shrink-0 p-0"
              icon={<ChevronUp className="size-3.5" />}
              isDisabled={index === 0}
              onClick={() => onMove(index, index - 1)}
              size={ButtonSize.ICON}
              tooltip="Move up"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
            <Button
              ariaLabel="Move follow-up down"
              className="size-7 shrink-0 p-0"
              icon={<ChevronDown className="size-3.5" />}
              isDisabled={index === queue.length - 1}
              onClick={() => onMove(index, index + 1)}
              size={ButtonSize.ICON}
              tooltip="Move down"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
            <Button
              ariaLabel="Send follow-up now"
              className="size-7 shrink-0 p-0"
              icon={<ArrowUp className="size-3.5" />}
              onClick={() => onSendNow(item.id)}
              size={ButtonSize.ICON}
              tooltip="Send now (stops the current run)"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
            <Button
              ariaLabel="Remove follow-up"
              className="size-7 shrink-0 p-0"
              icon={<X className="size-3.5" />}
              onClick={() => onRemove(item.id)}
              size={ButtonSize.ICON}
              tooltip="Remove"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
