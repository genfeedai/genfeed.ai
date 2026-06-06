'use client';

import { IngredientCategory } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IActivity } from '@genfeedai/interfaces';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import Badge from '@ui/display/badge/Badge';
import { Button, ButtonVariant, ComponentSize } from '@ui/primitives/button';
import Image from 'next/image';
import { HiBell, HiFilm, HiPlay, HiXMark } from 'react-icons/hi2';

type BackgroundTaskStatus = 'processing' | 'completed' | 'failed';

type Preview = { url: string; category: IngredientCategory };

type Props = {
  activity: IActivity;
  loadingTaskId: string | null;
  failedPreviews: Set<string>;
  status: BackgroundTaskStatus;
  label: string;
  progress: number | undefined;
  preview: Preview | undefined;
  onFailedPreview: (id: string) => void;
  onClick: (activity: IActivity) => void;
};

export default function BackgroundTaskRow({
  activity,
  loadingTaskId,
  failedPreviews,
  status,
  label,
  progress,
  preview,
  onFailedPreview,
  onClick,
}: Props) {
  const isLoading = loadingTaskId === activity.id;

  const statusIcon = (() => {
    if (isLoading) {
      return (
        <span className="animate-spin size-4 border-2 border-primary border-t-transparent rounded-full" />
      );
    }
    switch (status) {
      case 'processing':
        return activity.isRead ? null : (
          <HiBell className="size-4 animate-pulse text-primary" />
        );
      case 'failed':
        return <HiXMark className="size-4 text-error" />;
      case 'completed':
        return null;
    }
  })();

  const statusBadgeConfig = {
    completed: { label: 'Ready', variant: 'success' as const },
    failed: { label: 'Failed', variant: 'error' as const },
    processing: { label: 'Processing', variant: 'primary' as const },
  };

  const badgeConfig = statusBadgeConfig[status];
  const statusBadge = (
    <Badge variant={badgeConfig.variant} size={ComponentSize.SM}>
      {badgeConfig.label}
    </Badge>
  );

  const showPreviewImage =
    preview && status === 'completed' && !failedPreviews.has(activity.id);

  return (
    <div key={activity.id} className="w-full">
      <Button
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        onClick={() => onClick(activity)}
        isDisabled={isLoading}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2 text-left text-sm',
          'font-medium transition-colors duration-150 text-foreground/70 hover:text-foreground/90',
          'hover:bg-background/60 focus:bg-background/60 focus:outline-none',
          status === 'completed' && 'cursor-pointer',
          status === 'processing' && 'cursor-wait',
        )}
      >
        {showPreviewImage ? (
          <div className="relative size-12 shrink-0 overflow-hidden bg-background">
            <Image
              src={preview.url}
              alt={label}
              fill
              className="object-cover"
              sizes="48px"
              unoptimized
              onError={() => {
                onFailedPreview(activity.id);
              }}
            />
            {preview.category === IngredientCategory.VIDEO && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <HiPlay className="size-4 text-white" />
              </div>
            )}
          </div>
        ) : (
          <div className="size-12 shrink-0 bg-background flex items-center justify-center">
            <HiFilm className="size-5 text-foreground/40" />
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-sm font-medium">{label}</span>
            {statusIcon && <span className="shrink-0">{statusIcon}</span>}
          </div>

          {status === 'processing' && progress !== undefined && (
            <div className="w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-foreground/60">Progress</span>
                <span className="text-xs font-medium text-foreground/80">
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === 'processing' && progress === undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground/60">Processing…</span>
              <span className="animate-spin size-4 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            {statusBadge}
            <span className="text-xs text-foreground/50 shrink-0">
              <ClientDateTime
                value={activity.createdAt}
                format={(date) =>
                  date.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }
              />
            </span>
          </div>
        </div>
      </Button>
    </div>
  );
}
