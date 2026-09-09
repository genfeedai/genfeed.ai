'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationStatusProps } from '@genfeedai/props/ui/feedback/generation-status.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function GenerationStatus({
  status,
  assetLabel,
  label,
  startedAt,
  progress,
  completedCount,
  totalCount,
  detail,
  compact = false,
  isAnnounced = true,
  className,
  onCancel,
  isCancelling = false,
}: GenerationStatusProps) {
  const translate = useTranslations('ui.generationStatus');
  const isActive = ['submitting', 'queued', 'generating', 'saving'].includes(
    status,
  );
  const start =
    typeof startedAt === 'number' ? startedAt : Date.parse(startedAt ?? '');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive || !Number.isFinite(start)) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isActive, start]);
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const statusLabel =
    label ?? translate(status, { asset: assetLabel ?? translate('asset') });
  const hasProgress =
    isActive &&
    typeof progress === 'number' &&
    Number.isFinite(progress) &&
    progress >= 0 &&
    progress <= 100;
  const hasCounts =
    Number.isInteger(totalCount) &&
    (totalCount ?? 0) > 1 &&
    Number.isInteger(completedCount) &&
    (completedCount ?? -1) >= 0 &&
    (completedCount ?? 0) <= (totalCount ?? 0);

  return (
    <div
      className={cn(
        'min-w-0 space-y-1.5 text-xs text-muted-foreground',
        !compact && 'px-3 py-2',
        className,
      )}
      data-generation-status={status}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          role={isAnnounced ? 'status' : undefined}
          aria-live={isAnnounced ? 'polite' : undefined}
          aria-atomic={isAnnounced ? 'true' : undefined}
          className={cn(
            'min-w-0 break-words font-medium',
            isActive && 'animate-text-shimmer',
            status === 'failed' && 'text-destructive',
            status === 'ready' && 'text-success',
          )}
        >
          {statusLabel}
        </span>
        {isActive && Number.isFinite(start) ? (
          <span
            className="shrink-0 tabular-nums"
            role="timer"
            aria-live="off"
            aria-label={translate('elapsed', { time: elapsedLabel })}
          >
            {elapsedLabel}
          </span>
        ) : null}
        {onCancel && isActive ? (
          <Button
            className="pointer-events-auto ml-auto shrink-0"
            ariaLabel={translate('cancel')}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            withWrapper={false}
            isDisabled={isCancelling}
            onClick={onCancel}
          >
            {translate(isCancelling ? 'cancelling' : 'cancel')}
          </Button>
        ) : null}
      </div>
      {hasCounts ? (
        <p>
          {translate('outputs', {
            count: completedCount ?? 0,
            total: totalCount ?? 0,
          })}
        </p>
      ) : null}
      {hasProgress ? (
        <Progress
          aria-label={statusLabel}
          aria-valuetext={`${Math.round(progress)}%`}
          value={progress}
          className="h-1"
        />
      ) : null}
      {detail ? <p className="break-words leading-relaxed">{detail}</p> : null}
    </div>
  );
}
