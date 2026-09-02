'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import { getSafeExternalUrl } from '@pages/trends/shared/safe-external-url';
import type {
  DeskLightTableViewProps,
  DiscoveryDeskItem,
} from '@props/trends/discovery-desk.props';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { ExternalLink, Sparkles, Zap } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

interface DeskLightCardProps {
  isCursored: boolean;
  isSelected: boolean;
  item: DiscoveryDeskItem;
  onCursor: (key: string) => void;
  onSelectFinding?: (item: DiscoveryDeskItem) => void;
  onToggleSelect: (key: string) => void;
}

function DeskLightCard({
  isCursored,
  isSelected,
  item,
  onCursor,
  onSelectFinding,
  onToggleSelect,
}: DeskLightCardProps) {
  const remixSurface = useOptionalDiscoveryRemix();
  const translateCard = useTranslations('common.trends.card');

  const previewMediaUrl = getSafeExternalUrl(
    item.mediaUrl || item.thumbnailUrl,
  );
  const safeSourceUrl = getSafeExternalUrl(item.sourceUrl);
  const isVideo = item.contentType === 'video';

  const handleRemix = useCallback(() => {
    if (!item.remixSelector || !remixSurface) return;
    void remixSurface.openRemix(item.remixSelector);
  }, [item.remixSelector, remixSurface]);

  const handleOpenSource = useCallback(() => {
    if (!safeSourceUrl) return;
    window.open(safeSourceUrl, '_blank', 'noopener,noreferrer');
  }, [safeSourceUrl]);

  return (
    <Button
      aria-pressed={isSelected}
      className={`gen-glass-subtle gen-hover-lift group flex flex-col overflow-hidden rounded-card text-left transition ${
        isCursored ? 'ring-1 ring-inset ring-primary/50' : ''
      }`}
      onClick={() => onCursor(item.key)}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <div
        className={
          'relative aspect-video w-full overflow-hidden bg-black' /* design-system-allow-content-color */
        }
      >
        {previewMediaUrl ? (
          <Image
            alt={item.title || item.text || ''}
            className="object-cover"
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
            src={previewMediaUrl}
            unoptimized
          />
        ) : (
          <div className="flex size-full items-center justify-center text-foreground/40">
            {getPlatformIcon(item.platform, 'size-8')}
          </div>
        )}
        {isVideo ? (
          <span
            className={
              'absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white' /* design-system-allow-content-color */
            }
          >
            Video
          </span>
        ) : null}
        <div
          className="absolute left-2 top-2"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <Checkbox
            aria-label={`Select ${item.title || item.text || item.key}`}
            isChecked={isSelected}
            name={`select-${item.key}`}
            onChange={() => onToggleSelect(item.key)}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          {getPlatformIcon(item.platform, 'size-4')}
          <span className="truncate text-sm text-foreground/80">
            {item.authorHandle ? `@${item.authorHandle}` : item.platform}
          </span>
          <Badge className="ml-auto capitalize" variant="ghost">
            {item.source}
          </Badge>
        </div>

        <span className="line-clamp-2 text-sm font-medium text-foreground">
          {item.title || item.text || item.trendTopic || 'Untitled'}
        </span>

        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-foreground/60">
          <span className="inline-flex items-center gap-1">
            <Zap className="size-3" />
            {formatCompactNumber(item.velocity)}/h
          </span>
          <span>{formatCompactNumber(item.engagement)} engagement</span>
        </div>

        <div
          className="flex items-center gap-1.5 pt-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          {item.remixSelector ? (
            <Button
              className="flex-1"
              icon={<Sparkles className="size-3.5" />}
              label={translateCard('actions.remix')}
              onClick={handleRemix}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          ) : (
            <SimpleTooltip label={translateCard('actions.remixUnavailable')}>
              <Button
                className="flex-1"
                icon={<Sparkles className="size-3.5" />}
                isDisabled
                label={translateCard('actions.remix')}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              />
            </SimpleTooltip>
          )}
          {safeSourceUrl ? (
            <Button
              ariaLabel={translateCard('actions.openSource')}
              icon={<ExternalLink className="size-3.5" />}
              onClick={handleOpenSource}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
            />
          ) : null}
          {onSelectFinding ? (
            <Button
              ariaLabel="Use as context"
              icon={<ExternalLink className="size-3.5 rotate-90" />}
              onClick={() => onSelectFinding(item)}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
            />
          ) : null}
        </div>
      </div>
    </Button>
  );
}

/**
 * Direction B: media-first grid of `DiscoveryDeskItem[]` (the "Light table").
 * Big thumbnails/video previews, platform badge, author, engagement/velocity
 * chips, per-card select checkbox, and Remix — same selection and keyboard
 * behaviour as `DeskTableView`.
 */
export default function DeskLightTableView({
  cursorKey,
  items,
  onCursor,
  onSelectFinding,
  onToggleSelect,
  selection,
}: DeskLightTableViewProps) {
  const cards = useMemo(() => items, [items]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((item) => (
        <DeskLightCard
          key={item.key}
          isCursored={cursorKey === item.key}
          isSelected={selection.has(item.key)}
          item={item}
          onCursor={onCursor}
          onSelectFinding={onSelectFinding}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
