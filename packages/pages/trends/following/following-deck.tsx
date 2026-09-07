'use client';

import {
  ButtonSize,
  ButtonVariant,
  SocialSourceType,
} from '@genfeedai/contracts';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import DeskSourcesMenu from '@pages/trends/desk/desk-sources-menu';
import FollowSourceModal from '@pages/trends/following/FollowSourceModal';
import { getSafeExternalUrl } from '@pages/trends/shared/safe-external-url';
import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';
import type {
  FollowingDeckColumn,
  FollowingDeckPostProps,
  FollowingDeckProps,
} from '@props/trends/following-deck.props';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Text } from '@ui/typography/text';
import {
  AtSign,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Plus,
  Repeat2,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

/** Deck column order — the networks people actually follow first. */
const PLATFORM_ORDER = [
  'twitter',
  'linkedin',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'threads',
  'reddit',
  'pinterest',
];

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
};

function normalizePlatform(platform: string): string {
  const normalized = platform.toLowerCase();
  return normalized === 'x' ? 'twitter' : normalized;
}

function formatPlatformLabel(platform: string): string {
  return (
    PLATFORM_LABELS[platform] ??
    platform.charAt(0).toUpperCase() + platform.slice(1)
  );
}

function comparePlatforms(a: string, b: string): number {
  const aIndex = PLATFORM_ORDER.indexOf(a);
  const bIndex = PLATFORM_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) {
    return a.localeCompare(b);
  }
  if (aIndex === -1) {
    return 1;
  }
  if (bIndex === -1) {
    return -1;
  }
  return aIndex - bIndex;
}

function comparePublishedDesc(
  a: DiscoveryDeskItem,
  b: DiscoveryDeskItem,
): number {
  const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
  return bTime - aTime;
}

export function buildFollowingDeckColumns(
  items: DiscoveryDeskItem[],
  sources: FollowingDeckProps['sources'],
): FollowingDeckColumn[] {
  const columns = new Map<string, FollowingDeckColumn>();
  const ensureColumn = (platform: string): FollowingDeckColumn => {
    const existing = columns.get(platform);
    if (existing) {
      return existing;
    }
    const column: FollowingDeckColumn = { items: [], platform, sources: [] };
    columns.set(platform, column);
    return column;
  };

  for (const source of sources) {
    ensureColumn(normalizePlatform(source.platform)).sources.push(source);
  }
  for (const item of items) {
    ensureColumn(normalizePlatform(item.platform)).items.push(item);
  }

  return Array.from(columns.values())
    .map((column) => ({
      ...column,
      items: [...column.items].sort(comparePublishedDesc),
    }))
    .sort((a, b) => comparePlatforms(a.platform, b.platform));
}

function getAuthorDisplayName(item: DiscoveryDeskItem): string | undefined {
  if (item.raw.kind === 'source_post') {
    return item.raw.post.authorDisplayName ?? undefined;
  }
  return undefined;
}

function getAuthorAvatarUrl(item: DiscoveryDeskItem): string | undefined {
  if (item.raw.kind === 'source_post') {
    return getSafeExternalUrl(item.raw.post.authorAvatarUrl) ?? undefined;
  }
  return undefined;
}

function FollowingDeckPost({
  isCursored,
  isSelected,
  item,
  onCursor,
  onSelectFinding,
  onToggleSelect,
}: FollowingDeckPostProps) {
  const translate = useTranslations('common.trends.desk.following');
  const remixSurface = useOptionalDiscoveryRemix();
  const displayName = getAuthorDisplayName(item);
  const avatarUrl = getAuthorAvatarUrl(item);
  const handle = item.authorHandle ? `@${item.authorHandle}` : undefined;
  const previewMediaUrl = getSafeExternalUrl(
    item.thumbnailUrl || item.mediaUrl,
  );
  const safeSourceUrl = getSafeExternalUrl(item.sourceUrl);
  const hasDistinctTitle = Boolean(item.title && item.title !== item.text);
  const body = item.text || (hasDistinctTitle ? undefined : item.title);
  const initials = (displayName || item.authorHandle || item.platform)
    .slice(0, 2)
    .toUpperCase();

  const handleActivate = useCallback(() => {
    onCursor(item.key);
    onSelectFinding?.(item);
  }, [item, onCursor, onSelectFinding]);

  const handleOpenSource = useCallback(() => {
    if (!safeSourceUrl) {
      return;
    }
    window.open(safeSourceUrl, '_blank', 'noopener,noreferrer');
  }, [safeSourceUrl]);

  const handleRemix = useCallback(() => {
    if (!item.remixSelector || !remixSurface) {
      return;
    }
    void remixSurface.openRemix(item.remixSelector);
  }, [item.remixSelector, remixSurface]);

  return (
    <article
      aria-current={isCursored ? 'true' : undefined}
      className={`group relative flex flex-col gap-3 rounded-card bg-card p-3 shadow-border transition-[box-shadow,background-color] hover:bg-hover ${
        isCursored ? 'ring-1 ring-inset ring-primary/50' : ''
      } ${isSelected ? 'bg-accent' : ''}`}
      data-testid="following-deck-post"
    >
      <Button
        ariaLabel={item.title || item.text || item.key}
        className="absolute inset-0 rounded-card"
        onClick={handleActivate}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      />

      <header className="relative flex items-start gap-3">
        <Avatar className="size-9">
          {avatarUrl ? <AvatarImage alt="" src={avatarUrl} /> : null}
          <AvatarFallback className="text-xs font-semibold text-foreground/70">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Text as="p" className="truncate" size="sm" weight="semibold">
              {displayName || handle || item.platform}
            </Text>
            {getPlatformIcon(item.platform, 'size-3.5 shrink-0 opacity-60')}
          </div>
          <Text as="p" className="truncate" color="subtle-60" size="xs">
            {displayName && handle ? `${handle} · ` : ''}
            {item.publishedAt ? getRelativeTime(item.publishedAt) : ''}
          </Text>
        </div>
        <div
          className="relative shrink-0"
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
      </header>

      {hasDistinctTitle ? (
        <Text
          as="p"
          className="relative line-clamp-2 leading-5"
          size="sm"
          weight="semibold"
        >
          {item.title}
        </Text>
      ) : null}

      {body ? (
        <Text
          as="p"
          className="relative line-clamp-5 whitespace-pre-line leading-5"
          size="sm"
        >
          {body}
        </Text>
      ) : null}

      {previewMediaUrl ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-background-tertiary">
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="320px"
            src={previewMediaUrl}
            unoptimized
          />
          {item.contentType === 'video' ? (
            <Badge className="absolute right-2 top-2" variant="video">
              Video
            </Badge>
          ) : null}
        </div>
      ) : null}

      <footer className="relative flex items-center gap-3 text-xs text-foreground/55">
        {item.metrics.likes !== undefined ? (
          <span className="flex items-center gap-1 tabular-nums">
            <Heart className="size-3.5" />
            {formatCompactNumber(item.metrics.likes)}
          </span>
        ) : null}
        {item.metrics.comments !== undefined ? (
          <span className="flex items-center gap-1 tabular-nums">
            <MessageCircle className="size-3.5" />
            {formatCompactNumber(item.metrics.comments)}
          </span>
        ) : null}
        {item.metrics.shares !== undefined ? (
          <span className="flex items-center gap-1 tabular-nums">
            <Repeat2 className="size-3.5" />
            {formatCompactNumber(item.metrics.shares)}
          </span>
        ) : null}
        {item.metrics.views !== undefined ? (
          <span className="flex items-center gap-1 tabular-nums">
            <Eye className="size-3.5" />
            {formatCompactNumber(item.metrics.views)}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          {safeSourceUrl ? (
            <Button
              ariaLabel={translate('openSource')}
              icon={<ExternalLink className="size-3.5" />}
              onClick={handleOpenSource}
              size={ButtonSize.ICON}
              tooltip={translate('openSource')}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          ) : null}
          {item.remixSelector ? (
            <Button
              ariaLabel={translate('remix')}
              icon={<Sparkles className="size-3.5" />}
              onClick={handleRemix}
              size={ButtonSize.ICON}
              tooltip={translate('remix')}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          ) : null}
        </span>
      </footer>
    </article>
  );
}

function FollowingDeckColumnView({
  column,
  cursorKey,
  onCursor,
  onSelectFinding,
  onToggleSelect,
  selection,
}: {
  column: FollowingDeckColumn;
  cursorKey: string | null;
  onCursor: (key: string) => void;
  onSelectFinding?: (item: DiscoveryDeskItem) => void;
  onToggleSelect: (key: string) => void;
  selection: Set<string>;
}) {
  const translate = useTranslations('common.trends.desk.following');
  const label = formatPlatformLabel(column.platform);
  const creatorSources = column.sources.filter(
    (source) => source.sourceType !== SocialSourceType.POST,
  );

  return (
    <section
      aria-label={label}
      className="flex max-h-[calc(100dvh-13rem)] w-80 shrink-0 snap-start flex-col overflow-hidden rounded-card bg-background-secondary shadow-border"
      data-testid="following-deck-column"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        {getPlatformIcon(column.platform, 'size-4 shrink-0')}
        <Text as="h2" className="truncate" size="sm" weight="semibold">
          {label}
        </Text>
        <Text as="p" className="ml-auto shrink-0" color="subtle-60" size="xs">
          {translate('columnSources', { count: creatorSources.length })}
          {' · '}
          {translate('columnPosts', { count: column.items.length })}
        </Text>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {column.items.length > 0 ? (
          column.items.map((item) => (
            <FollowingDeckPost
              isCursored={cursorKey === item.key}
              isSelected={selection.has(item.key)}
              item={item}
              key={item.key}
              onCursor={onCursor}
              onSelectFinding={onSelectFinding}
              onToggleSelect={onToggleSelect}
            />
          ))
        ) : (
          <Text
            as="p"
            className="px-2 py-6 text-center"
            color="subtle-60"
            size="sm"
          >
            {translate('columnEmpty')}
          </Text>
        )}
      </div>
    </section>
  );
}

/**
 * Following deck — one vertical column per platform, laid out side by side
 * like X Pro / TweetDeck. Every column holds the posts from the creators the
 * brand follows on that network, newest first, and the trailing tile opens
 * the Follow modal so a new network becomes a new column.
 */
export default function FollowingDeck({
  brandId,
  cursorKey,
  items,
  onCursor,
  onSelectFinding,
  onSourcesChanged,
  onToggleSelect,
  selection,
  sources,
}: FollowingDeckProps) {
  const translate = useTranslations('common.trends.desk.following');
  const [isFollowOpen, setIsFollowOpen] = useState(false);
  const columns = useMemo(
    () => buildFollowingDeckColumns(items, sources),
    [items, sources],
  );

  const followModal = (
    <FollowSourceModal
      brandId={brandId}
      existingSources={sources}
      onFollowed={onSourcesChanged}
      onOpenChange={setIsFollowOpen}
      open={isFollowOpen}
    />
  );

  if (columns.length === 0) {
    return (
      <>
        <CardEmpty
          actions={
            <Button
              icon={<AtSign className="size-3.5" />}
              label={translate('followCreators')}
              onClick={() => setIsFollowOpen(true)}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          }
          description={translate('emptyDescription')}
          icon={AtSign}
          label={translate('emptyTitle')}
        />
        {followModal}
      </>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      data-testid="following-deck"
    >
      <div className="flex items-center justify-between gap-3">
        <Text as="p" color="subtle-60" size="sm">
          {translate('subtitle')}
        </Text>
        <DeskSourcesMenu
          brandId={brandId}
          onSourcesChanged={onSourcesChanged}
          sources={sources}
        />
      </div>
      <div className="flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto pb-2">
        {columns.map((column) => (
          <FollowingDeckColumnView
            column={column}
            cursorKey={cursorKey}
            key={column.platform}
            onCursor={onCursor}
            onSelectFinding={onSelectFinding}
            onToggleSelect={onToggleSelect}
            selection={selection}
          />
        ))}
        <Button
          className="flex min-h-48 w-64 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border-strong p-6 text-center normal-case text-foreground/60 transition hover:bg-hover hover:text-foreground"
          onClick={() => setIsFollowOpen(true)}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <Plus className="size-5" />
          <span className="text-sm font-medium">{translate('addColumn')}</span>
          <span className="text-xs text-foreground/50">
            {translate('addColumnDescription')}
          </span>
        </Button>
      </div>
      {followModal}
    </div>
  );
}
