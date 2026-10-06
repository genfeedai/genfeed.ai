'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import DeskMediaPreview from '@pages/trends/desk/desk-media-preview';
import { getSafeExternalUrl } from '@pages/trends/shared/safe-external-url';
import type {
  DeskLightCardProps,
  DeskLightTableViewProps,
} from '@props/trends/discovery-desk.props';
import type { CollectionOverflowAction } from '@props/ui/collection/collection.props';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { ExternalLink, Sparkles, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

function DeskLightCard({
  isCursored,
  isPreviewActive,
  onPreviewChange,
  isSelected,
  item,
  onCursor,
  onSelectFinding,
  onToggleSelect,
}: DeskLightCardProps) {
  const remixSurface = useOptionalDiscoveryRemix();
  const translateCard = useTranslations('common.trends.card');

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

  return (
    <Card
      bodyClassName="flex-1 gap-0 p-0"
      className={cn(
        'flex flex-col hover:shadow-border-strong',
        isCursored && 'ring-1 ring-inset ring-primary/50',
      )}
      data-testid={`desk-light-card-${item.key}`}
    >
      {/* The cursor target and the checkbox are siblings, never nested. */}
      <div className="relative flex flex-1 flex-col">
        <Button
          aria-current={isCursored || undefined}
          className="flex flex-1 flex-col text-left"
          onClick={() => onCursor(item.key)}
          onPointerEnter={() => onPreviewChange(item.key)}
          onPointerLeave={() => onPreviewChange(null)}
          onFocus={() => onPreviewChange(item.key)}
          onBlur={() => onPreviewChange(null)}
          textTransform="none"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <div
            className={
              'relative aspect-video w-full overflow-hidden bg-black' /* design-system-allow-content-color */
            }
          >
            <DeskMediaPreview item={item} isActive={isPreviewActive} />
            {isVideo ? (
              <span
                className={
                  'absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white' /* design-system-allow-content-color */
                }
              >
                {translateCard('videoBadge')}
              </span>
            ) : null}
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
              {item.title ||
                item.text ||
                item.trendTopic ||
                translateCard('untitled')}
            </span>

            <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-foreground/60">
              <span className="inline-flex items-center gap-1">
                <Zap className="size-3" />
                {translateCard('velocityPerHour', {
                  value: formatCompactNumber(item.velocity),
                })}
              </span>
              <span>
                {translateCard('engagementCount', {
                  value: formatCompactNumber(item.engagement),
                })}
              </span>
            </div>
          </div>
        </Button>

        <div className="absolute left-2 top-2">
          <Checkbox
            aria-label={translateCard('select', {
              title: item.title || item.text || item.key,
            })}
            isChecked={isSelected}
            name={`select-${item.key}`}
            onChange={() => onToggleSelect(item.key)}
          />
        </div>
      </div>

      <CollectionItemActions
        className="w-full px-3 pb-3"
        overflow={overflowActions}
        primary={
          item.remixSelector ? (
            <Button
              className="w-full"
              icon={<Sparkles className="size-3.5" />}
              label={translateCard('actions.remix')}
              onClick={handleRemix}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
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
                variant={ButtonVariant.GHOST}
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
 * Direction B: media-first grid of `DiscoveryDeskItem[]` (the "Light table").
 * Big thumbnails/video previews, platform badge, author, engagement/velocity
 * chips, per-card select checkbox, and Remix as the one visible action —
 * same selection and keyboard behaviour as `DeskTableView`.
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
    <CollectionGrid data-testid="desk-light-table-grid" maxColumns={4}>
      {items.map((item) => (
        <DeskLightCard
          key={item.key}
          isCursored={cursorKey === item.key}
          isPreviewActive={previewKey === item.key}
          onPreviewChange={setPreviewKey}
          isSelected={selection.has(item.key)}
          item={item}
          onCursor={onCursor}
          onSelectFinding={onSelectFinding}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </CollectionGrid>
  );
}
