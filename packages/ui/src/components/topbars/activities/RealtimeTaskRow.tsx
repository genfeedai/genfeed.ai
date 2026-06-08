'use client';

import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IBackgroundTask } from '@genfeedai/interfaces';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import Badge from '@ui/display/badge/Badge';
import { Button, ButtonVariant } from '@ui/primitives/button';
import { HiArrowPath, HiCheck, HiXMark } from 'react-icons/hi2';

type Props = {
  task: IBackgroundTask;
  etaLabel: string | null;
  elapsedLabel: string | null;
  onClick: (task: IBackgroundTask) => void;
};

export default function RealtimeTaskRow({
  task,
  etaLabel,
  elapsedLabel,
  onClick,
}: Props) {
  const isProcessing =
    task.status === 'pending' || task.status === 'processing';

  const badgeVariant: 'success' | 'error' | 'primary' =
    task.status === 'completed'
      ? 'success'
      : task.status === 'failed'
        ? 'error'
        : 'primary';

  return (
    <Button
      key={task.id}
      withWrapper={false}
      variant={ButtonVariant.UNSTYLED}
      onClick={() => onClick(task)}
      className={cn(
        'flex w-full flex-col items-start gap-2 px-3 py-2 text-left text-sm',
        'font-medium transition-colors duration-150 text-foreground/70 hover:text-foreground/90',
        'hover:bg-background/60 focus:bg-background/60 focus:outline-none',
        isProcessing && 'cursor-wait',
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="truncate">{task.title}</span>
        {task.status === 'completed' ? (
          <HiCheck className="size-4 text-success" />
        ) : task.status === 'failed' ? (
          <HiXMark className="size-4 text-error" />
        ) : (
          <HiArrowPath className="size-4 animate-spin text-primary" />
        )}
      </div>

      {isProcessing && (
        <div className="w-full">
          {task.currentPhase && (
            <div className="mb-1 text-xs text-foreground/60">
              {task.currentPhase}
            </div>
          )}
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-foreground/60">Progress</span>
            <span className="text-xs font-medium text-foreground/80">
              {Math.round(task.progress)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          {(etaLabel || elapsedLabel) && (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-foreground/60">
              <span>{etaLabel ?? 'Processing…'}</span>
              {elapsedLabel && <span>Elapsed {elapsedLabel}</span>}
            </div>
          )}
          {(task.remainingDurationMs ?? task.estimatedDurationMs ?? 0) >=
            60_000 && (
            <div className="mt-2 text-xs text-foreground/50">
              You can keep working. We'll notify you when it's ready.
            </div>
          )}
        </div>
      )}

      {!isProcessing && elapsedLabel && (
        <div className="text-xs text-foreground/60">
          {task.status === 'completed'
            ? `Completed in ${elapsedLabel}`
            : `Failed after ${elapsedLabel}`}
        </div>
      )}

      <div className="flex w-full items-center justify-between gap-2">
        <Badge variant={badgeVariant} size={ComponentSize.SM}>
          {task.status === 'pending'
            ? 'Pending'
            : task.status === 'processing'
              ? 'Processing'
              : task.status === 'completed'
                ? 'Ready'
                : 'Failed'}
        </Badge>
        <span className="text-xs text-foreground/50 shrink-0">
          <ClientDateTime
            value={task.createdAt}
            format={(date) =>
              date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            }
          />
        </span>
      </div>
    </Button>
  );
}
