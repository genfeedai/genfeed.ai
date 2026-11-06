'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { CollectionOverflowAction } from '@props/ui/collection/collection.props';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import OrderedMasonry from '@ui/display/masonry/OrderedMasonry';
import { MASONRY_MEDIA_HOVER_CLASS } from '@ui/masonry/shared/masonry-hover-motion';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import {
  hoverConcealClassName,
  hoverRevealClassName,
} from '@ui/styles/hover-reveal';
import { SELECTED_CARD_CLASS } from '@ui/styles/selected-card';
import { ExternalLink, Sparkles, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useOptionalDiscoveryRemix } from '@/features/research/remix/DiscoveryRemixProvider';
import DeskMediaPreview from '@/features/trends/desk/desk-media-preview';
import { hasDeskMedia } from '@/features/trends/desk/desk-media-source';
import type {
  DeskLightCardProps,
  DeskLightTableViewProps,
} from '@/features/trends/props/discovery-desk.props';
import { getSafeExternalUrl } from '@/features/trends/shared/safe-external-url';

function DeskLightCard({
  isCursored,
  isPreviewActive,
  onPreviewChange,
  isSelected,
  isSelectionActive,
  item,
  onCursor,
  onSelectFinding,
  onToggleSelect,
}: DeskLightCardProps) {
  const remixSurface = useOptionalDiscoveryRemix();
  const translateCard = useTranslations('common.trends.card');
  const [hasMediaFailed, setHasMediaFailed] = useState(false);

  const safeSourceUrl = getSafeExternalUrl(item.sourceUrl);
  const isVideo = item.contentType === 'video';

  const handleRemix = useCallback(() => {
    if (!item.remixSelector || !remixSurface) return;
    void remixSurface.openRemix(item.remixSelector);
  }, [item.remixSelector, remixSurface]);

  const overflowActions = useMemo<CollectionOverflowAction[]>(() => {
    const actions: CollectionOverflowAction[] = [];
    if (onSelectFinding) {
      actions.push({
        id: 'use-as-context',
        label: translateCard('actions.useAsContext'),
        onSelect: () => onSelectFinding(item),
      });
    }
    if (safeSourceUrl) {
      actions.push({
        href: safeSourceUrl,
        icon: <ExternalLink className="size-4" />,
        id: 'open-source',
        isExternal: true,
        label: translateCard('actions.openSource'),
      });
    }
    return actions;
  }, [item, onSelectFinding, safeSourceUrl, translateCard]);

  const label =
    item.title || item.text || item.trendTopic || translateCard('untitled');
  const handle = item.authorHandle ? `@${item.authorHandle}` : item.platform;
  const velocityLabel =
    item.velocity >= 1
      ? translateCard('velocityPerHour', {
          value: formatCompactNumber(item.velocity),
        })
      : null;
  const engagementLabel =
    item.engagement > 0
      ? translateCard('engagementCount', {
          value: formatCompactNumber(item.engagement),
        })
      : null;
  const isMediaTile = hasDeskMedia(item) && !hasMediaFailed;

  const stats = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {engagementLabel ? <span>{engagementLabel}</span> : null}
      {velocityLabel ? (
        <span className="inline-flex items-center gap-1">
          <Zap aria-hidden="true" className="size-3" />
          {velocityLabel}
        </span>
      ) : null}
    </span>
  );

  return (
    <Card
      padding={CardPadding.NONE}
      gap={CardGap.NONE}
      isInteractive
      isSelected={isCursored}
      className={cn(
        'group group/tile relative overflow-hidden',
        isSelected && SELECTED_CARD_CLASS,
      )}
      data-motion={isSelected ? 'allow' : undefined}
      data-testid={`desk-light-card-${item.key}`}
    >
      {/* The cursor target, the checkbox and the actions are siblings, never nested. */}
      <Button
        aria-current={isCursored || undefined}
        className="block w-full text-left"
        onClick={() => onCursor(item.key)}
        onPointerEnter={() => onPreviewChange(item.key)}
        onPointerLeave={() => onPreviewChange(null)}
        onFocus={() => onPreviewChange(item.key)}
        onBlur={() => onPreviewChange(null)}
        textTransform="none"
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      >
        {isMediaTile ? (
          <span className="relative block">
            <DeskMediaPreview
              className="rounded-none"
              isActive={isPreviewActive}
              isNativeAspect
              item={item}
              mediaClassName={MASONRY_MEDIA_HOVER_CLASS}
              onThumbnailError={
                isVideo ? undefined : () => setHasMediaFailed(true)
              }
            />
            <Badge
              className={cn(
                'pointer-events-none absolute top-2 left-2',
                hoverConcealClassName(),
              )}
              icon={getPlatformIcon(item.platform, 'size-3.5')}
              shape="pill"
              variant="overlay"
            >
              {isVideo ? translateCard('videoBadge') : null}
            </Badge>
            {velocityLabel ? (
              <Badge
                className={cn(
                  'pointer-events-none absolute bottom-2 left-2',
                  hoverConcealClassName(),
                )}
                icon={<Zap aria-hidden="true" className="size-3" />}
                shape="pill"
                variant="overlay"
              >
                {velocityLabel}
              </Badge>
            ) : null}
            <span
              className={cn(
                'pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-3 pt-14 pb-14 text-white transition-opacity duration-200' /* design-system-allow-content-color -- media overlay */,
                hoverRevealClassName({ isInteractive: false }),
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                {getPlatformIcon(item.platform, 'size-3.5')}
                <span className="truncate font-medium">{handle}</span>
                <span
                  className={
                    'ml-auto text-[10px] font-semibold tracking-wide text-white/70 uppercase' /* design-system-allow-content-color -- media overlay */
                  }
                >
                  {item.source}
                </span>
              </span>
              <span className="line-clamp-2 text-sm font-medium">{label}</span>
              <span
                className={
                  'text-white/70' /* design-system-allow-content-color -- media overlay */
                }
              >
                {stats}
              </span>
            </span>
          </span>
        ) : (
          <span className="flex flex-col gap-2.5 p-3.5 [@media(hover:none)]:pb-14">
            <span className="flex min-w-0 items-center gap-2 pr-7 text-sm text-foreground/80">
              {getPlatformIcon(item.platform, 'size-4')}
              <span className="truncate">{handle}</span>
            </span>
            {item.title && item.text && item.title !== item.text ? (
              <span className="text-sm font-semibold leading-snug text-foreground">
                {item.title}
              </span>
            ) : null}
            <span className="line-clamp-8 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {item.text || label}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-foreground/60">
              {stats}
              <Badge className="ml-auto" variant="secondary">
                {item.source}
              </Badge>
            </span>
          </span>
        )}
      </Button>

      <div
        className={cn(
          'absolute top-2 right-2 z-20 transition-opacity duration-200',
          isSelected || isSelectionActive
            ? 'opacity-100'
            : hoverRevealClassName({ focus: 'within' }),
        )}
      >
        <Checkbox
          aria-label={translateCard('select', {
            title: item.title || item.text || item.key,
          })}
          isChecked={isSelected}
          name={`select-${item.key}`}
          onChange={() => onToggleSelect(item.key)}
        />
      </div>

      <CollectionItemActions
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 w-full px-3 pt-6 pb-3 transition-opacity duration-200',
          !isMediaTile && 'bg-gradient-to-t from-card via-card to-transparent',
          hoverRevealClassName(),
        )}
        overflow={overflowActions}
        primary={
          item.remixSelector ? (
            <Button
              className="w-full"
              icon={<Sparkles className="size-3.5" />}
              label={translateCard('actions.remix')}
              onClick={handleRemix}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              wrapperClassName="flex-1"
            />
          ) : (
            <SimpleTooltip label={translateCard('actions.remixUnavailable')}>
              <Button
                className="w-full"
                icon={<Sparkles className="size-3.5" />}
                isDisabled
                label={translateCard('actions.remix')}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                wrapperClassName="flex-1"
              />
            </SimpleTooltip>
          )
        }
      />
    </Card>
  );
}

/**
 * Direction B: the "Light table", `DiscoveryDeskItem[]` on the Library's
 * ordered masonry. Media signals keep their own shape (vertical video stays
 * vertical) with the shared hover zoom and a gradient caption; posts without
 * media are text tiles at their natural height. Remix is the one visible
 * action, revealed on hover with the overflow menu — same selection and
 * keyboard behaviour as `DeskTableView`.
 */
export default function DeskLightTableView({
  cursorKey,
  items,
  onCursor,
  onSelectFinding,
  onToggleSelect,
  selection,
}: DeskLightTableViewProps) {
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  return (
    <div data-testid="desk-light-table-grid">
      <OrderedMasonry>
        {items.map((item) => (
          <DeskLightCard
            key={item.key}
            isCursored={cursorKey === item.key}
            isPreviewActive={previewKey === item.key}
            onPreviewChange={setPreviewKey}
            isSelected={selection.has(item.key)}
            isSelectionActive={selection.size > 0}
            item={item}
            onCursor={onCursor}
            onSelectFinding={onSelectFinding}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </OrderedMasonry>
    </div>
  );
}
