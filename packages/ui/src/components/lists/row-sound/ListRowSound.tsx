import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IMetadata } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ListRowSoundProps } from '@props/content/list.props';
import { Button } from '@ui/primitives/button';
import type { MouseEvent } from 'react';
import { HiPause, HiPlay } from 'react-icons/hi2';

function renderLegacyPlaybackControl({
  ingredient,
  isActive,
  onPlay,
}: Pick<ListRowSoundProps, 'ingredient' | 'isActive' | 'onPlay'>) {
  if (!ingredient || !onPlay) {
    return null;
  }

  return (
    <Button
      label={
        ingredient.isPlaying ? (
          <HiPause className="text-lg" />
        ) : (
          <HiPlay className="text-lg" />
        )
      }
      variant={isActive ? ButtonVariant.SECONDARY : ButtonVariant.DEFAULT}
      size={ButtonSize.ICON}
      className="transition-all duration-300"
      onClick={(event: MouseEvent) => onPlay(event, ingredient)}
    />
  );
}

export default function ListRowSound({
  actions,
  badges,
  className,
  index,
  ingredient,
  isActive,
  isSelected = false,
  leading,
  metaPrimary,
  metaSecondary,
  onClick = () => {},
  onPlay,
  onRowClick,
  playbackControl,
  providerLabel,
  stats,
  subtitle,
  title,
}: ListRowSoundProps) {
  const metadata = ingredient?.metadata as IMetadata | undefined;
  const resolvedTitle =
    title ?? metadata?.label ?? ingredient?.id ?? `Sound ${index ?? 0}`;
  const resolvedSubtitle = subtitle ?? metadata?.description;
  const resolvedProvider = providerLabel ?? ingredient?.provider;
  const resolvedPlaybackControl =
    playbackControl ??
    renderLegacyPlaybackControl({
      ingredient,
      isActive: isActive ?? isSelected,
      onPlay,
    });

  return (
    <li
      className={cn(
        'group grid min-h-20 grid-cols-[auto_minmax(0,2.4fr)_minmax(180px,1.4fr)_minmax(120px,0.8fr)_auto] items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 transition-colors duration-200',
        'hover:border-white/[0.12] hover:bg-white/[0.04]',
        (isActive ?? isSelected) && 'border-white/[0.18] bg-white/[0.06]',
        onRowClick && 'cursor-pointer',
        className,
      )}
      onClick={() => {
        if (ingredient) {
          onClick(ingredient.id);
        }
        onRowClick?.();
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading ?? (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-sm font-medium text-white/70">
            {typeof index === 'number' ? (
              index + 1
            ) : (
              <HiPlay className="h-4 w-4" />
            )}
          </div>
        )}
        {resolvedPlaybackControl ? (
          <div
            className="shrink-0"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {resolvedPlaybackControl}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 space-y-1">
        <div className="truncate text-sm font-semibold text-white">
          {resolvedTitle}
        </div>
        {resolvedSubtitle ? (
          <div className="truncate text-sm text-muted-foreground">
            {resolvedSubtitle}
          </div>
        ) : null}
        {badges ? (
          <div className="flex flex-wrap items-center gap-2">{badges}</div>
        ) : null}
      </div>

      <div className="min-w-0 space-y-1 text-sm text-muted-foreground">
        {resolvedProvider ? (
          <div className="truncate font-medium text-white/85">
            {resolvedProvider}
          </div>
        ) : null}
        {metaPrimary ? (
          <div
            className={cn(
              'min-w-0',
              (typeof metaPrimary === 'string' ||
                typeof metaPrimary === 'number') &&
                'truncate',
            )}
          >
            {metaPrimary}
          </div>
        ) : null}
        {metaSecondary ? (
          <div className="truncate text-xs">{metaSecondary}</div>
        ) : null}
      </div>

      <div className="min-w-0 text-sm text-muted-foreground">{stats}</div>

      <div
        className="flex shrink-0 items-center justify-start gap-2 lg:justify-end"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {actions}
      </div>
    </li>
  );
}
