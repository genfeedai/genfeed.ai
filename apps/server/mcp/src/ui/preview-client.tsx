import '@mcp/ui/preview-runtime';
import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
  CardVariant,
  ComponentSize,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import type {
  McpCalendarDay,
  McpCard,
  McpCardAction,
  McpCardMedia,
  McpCardView,
  McpOrganizationSwitcher,
} from '@mcp/shared/interfaces/mcp-app.interface';
import type {
  BrandListProps,
  CardPreviewProps,
  DescriptionProps,
  IconActionProps,
  ImagePreview,
  MediaPreviewProps,
  OrganizationSwitcherProps,
  PendingResponse,
  PreviewBridge,
  PreviewProps,
  SummaryCardProps,
} from '@mcp/shared/interfaces/mcp-preview.interface';
import { isAccountAvatarOrigin } from '@mcp/ui/avatar-origins';
import { CardBoundary } from '@mcp/ui/card-boundary';
import { FactValue, MetricList, StatusBadge } from '@mcp/ui/card-parts';
import uiMessages from '@preview-messages/ui';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import MediaPlayer from '@ui/media-player/MediaPlayer';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@ui/primitives/dialog';
import { EmptyState } from '@ui/primitives/empty-state';
import { Progress } from '@ui/primitives/progress';
import { SelectField } from '@ui/primitives/select';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  ExternalLink,
  FilePen,
  Maximize2,
  Music,
} from 'lucide-react';
import Image from 'next/image';
import { NextIntlClientProvider } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function parseSafeUrl(value: unknown): URL | undefined {
  try {
    const url = new URL(text(value));
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
function safeUrl(value: unknown): string | undefined {
  return parseSafeUrl(value)?.href;
}
function mediaUrl(
  value: unknown,
  origins: readonly string[],
): string | undefined {
  const url = parseSafeUrl(value);
  return url && origins.includes(url.origin) ? url.href : undefined;
}
/** A safe avatar on a bridge media origin or a known account-avatar CDN. */
function trustedAvatarUrl(
  value: unknown,
  origins: readonly string[],
): string | undefined {
  const url = parseSafeUrl(value);
  return url && (origins.includes(url.origin) || isAccountAvatarOrigin(url))
    ? url.href
    : undefined;
}
function card(value: unknown): McpCard | undefined {
  const row = record(value);
  if (
    ![
      'post',
      'article',
      'image',
      'video',
      'audio',
      'media',
      'summary',
    ].includes(text(row.kind))
  )
    return undefined;
  return {
    id: text(row.id),
    title: text(row.title),
    description: text(row.description),
    body: text(row.body) || undefined,
    kind: row.kind as McpCard['kind'],
    status: text(row.status),
    platform: text(row.platform),
    date: text(row.date),
    url: safeUrl(row.url),
    thumbnailUrl: safeUrl(row.thumbnailUrl),
    mediaUrl: safeUrl(row.mediaUrl),
    avatarUrl: safeUrl(row.avatarUrl),
    actions: Array.isArray(row.actions)
      ? row.actions.slice(0, 4).flatMap((value): McpCardAction[] => {
          const item = record(value);
          if (item.kind === 'select_brand' && text(item.brandId))
            return [
              {
                kind: 'select_brand',
                brandId: text(item.brandId),
                label: text(item.label) || 'Select',
              },
            ];
          if (
            item.kind === 'resolve_approval' &&
            text(item.approvalId) &&
            (item.decision === 'approve' || item.decision === 'decline')
          )
            return [
              {
                kind: 'resolve_approval',
                approvalId: text(item.approvalId),
                decision: item.decision,
                label: text(item.label) || 'Approve',
              },
            ];
          return [];
        })
      : undefined,
    linkLabel: text(row.linkLabel) || undefined,
    author: {
      name: text(record(row.author).name),
      handle: text(record(row.author).handle),
      avatarUrl: safeUrl(record(row.author).avatarUrl),
    },
    media: Array.isArray(row.media)
      ? row.media.slice(0, 10).flatMap((value, index) => {
          const item = record(value);
          return ['image', 'video', 'audio'].includes(text(item.kind))
            ? [
                {
                  id: text(item.id) || `media-${index}`,
                  kind: item.kind as 'image' | 'video' | 'audio',
                  url: safeUrl(item.url),
                  thumbnailUrl: safeUrl(item.thumbnailUrl),
                },
              ]
            : [];
        })
      : undefined,
    mediaKind: ['image', 'video', 'audio'].includes(text(row.mediaKind))
      ? (row.mediaKind as McpCard['mediaKind'])
      : undefined,
    attachments: Array.isArray(row.attachments)
      ? row.attachments.filter((kind): kind is 'image' | 'video' | 'audio' =>
          ['image', 'video', 'audio'].includes(text(kind)),
        )
      : undefined,
    hasAvatar: row.hasAvatar === true,
    facts: Array.isArray(row.facts)
      ? row.facts.slice(0, 12).flatMap((value) => {
          const item = record(value);
          return text(item.label) && text(item.value)
            ? [
                {
                  label: text(item.label),
                  value: text(item.value),
                  status: text(item.status) || undefined,
                  items: Array.isArray(item.items)
                    ? item.items.slice(0, 50).flatMap((entry) => {
                        const chip = record(entry);
                        return text(chip.label)
                          ? [
                              {
                                label: text(chip.label),
                                avatarUrl: safeUrl(chip.avatarUrl),
                                hasAvatar: chip.hasAvatar === true || undefined,
                                platform: text(chip.platform) || undefined,
                                status: text(chip.status) || undefined,
                              },
                            ]
                          : [];
                      })
                    : undefined,
                },
              ]
            : [];
        })
      : undefined,
    metrics: Array.isArray(row.metrics)
      ? row.metrics.slice(0, 6).flatMap((value) => {
          const item = record(value);
          const trend = record(item.trend);
          return text(item.label) && text(item.value)
            ? [
                {
                  label: text(item.label),
                  value: text(item.value),
                  isPrimary: item.isPrimary === true,
                  trend: ['up', 'down', 'flat'].includes(text(trend.direction))
                    ? {
                        direction: text(trend.direction) as
                          | 'up'
                          | 'down'
                          | 'flat',
                        label: text(trend.label),
                      }
                    : undefined,
                },
              ]
            : [];
        })
      : undefined,
    isPending: row.isPending === true,
    progress:
      typeof row.progress === 'number' && Number.isFinite(row.progress)
        ? Math.max(0, Math.min(100, row.progress))
        : undefined,
    stage: text(row.stage),
  };
}
function cards(value: unknown): McpCard[] {
  return Array.isArray(value)
    ? value
        .slice(0, 24)
        .map(card)
        .filter((item): item is McpCard => Boolean(item))
    : [];
}
function readOrganizations(
  value: unknown,
): McpOrganizationSwitcher | undefined {
  const switcher = record(value);
  if (!Array.isArray(switcher.choices)) return undefined;
  return {
    activeId: text(switcher.activeId),
    canSwitch: switcher.canSwitch === true,
    choices: switcher.choices.slice(0, 50).flatMap((entry) => {
      const choice = record(entry);
      return text(choice.id)
        ? [
            {
              id: text(choice.id),
              isActive: choice.isActive === true,
              label: text(choice.label) || 'Organization',
            },
          ]
        : [];
    }),
  };
}
function readView(result: unknown): McpCardView | undefined {
  const data = record(result);
  const view = record(record(data.structuredContent).genfeedCards);
  // Only a queued approval attaches cards to an error result.
  if (!Array.isArray(view.cards) || (data.isError && !view.isApproval))
    return undefined;
  const calendar = record(view.calendar);
  return {
    organizations: readOrganizations(view.organizations),
    cards: cards(view.cards),
    title: text(view.title) || 'Genfeed content',
    isCountHidden: view.isCountHidden === true,
    isApproval: view.isApproval === true,
    total:
      typeof view.total === 'number' && Number.isFinite(view.total)
        ? Math.max(0, view.total)
        : view.cards.length,
    layout: ['posts', 'media', 'calendar', 'organizations'].includes(
      text(view.layout),
    )
      ? (view.layout as McpCardView['layout'])
      : 'cards',
    calendar: {
      days: Array.isArray(calendar.days)
        ? calendar.days.map((value) => {
            const day = record(value);
            return {
              date: text(day.date),
              isGap: day.isGap === true,
              posts: cards(day.posts),
            };
          })
        : [],
      draftsCount:
        typeof calendar.draftsCount === 'number'
          ? Math.max(0, calendar.draftsCount)
          : 0,
    },
  };
}
function formatDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, options);
}
function platformName(value: string): string {
  return formatPlatformLabel(value) || 'Post';
}
function openExternal(bridge: PreviewBridge, url: string) {
  bridge
    .request('ui/open-link', { url })
    .then((result) => {
      if (record(result).isError) throw new Error('blocked');
    })
    .catch(() =>
      bridge.notify(
        'The host could not open the link. Copy the link address to open it in your browser.',
      ),
    );
}
/** A card's header control: an icon that opens a link or runs an action. */
function IconAction({ label, icon, url, bridge, onClick }: IconActionProps) {
  return url ? (
    <Button
      asChild
      size={ButtonSize.ICON}
      variant={ButtonVariant.GHOST}
      withWrapper={false}
      ariaLabel={label}
      className="size-8 shrink-0"
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          event.preventDefault();
          openExternal(bridge, url);
        }}
      >
        {icon}
      </a>
    </Button>
  ) : (
    <Button
      size={ButtonSize.ICON}
      variant={ButtonVariant.GHOST}
      withWrapper={false}
      ariaLabel={label}
      className="size-8 shrink-0"
      onClick={(event) => onClick?.(event.currentTarget)}
    >
      {icon}
    </Button>
  );
}
/** Brands as one compact list: logo, name and handle, and a select button. */
function BrandList({
  items,
  bridge,
  isActionPending,
  selectedId,
  onAction,
}: BrandListProps) {
  return (
    <Card padding={CardPadding.SM} className="brands col-span-full min-w-0">
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => {
          const avatarUrl = trustedAvatarUrl(item.avatarUrl, bridge.origins);
          const handle = item.facts
            ?.find((fact) => fact.label === 'Handle')
            ?.value.replace(/^@/, '');
          const action = item.actions?.find(
            (candidate) => candidate.kind === 'select_brand',
          );
          const isSelected = Boolean(selectedId) && item.id === selectedId;
          return (
            <li
              key={item.id || item.title}
              className="flex min-w-0 items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <Avatar
                name={item.title}
                onLoadingStatusChange={() => bridge.resize()}
                shape="square"
                size="md"
                src={avatarUrl}
              />
              <div className="min-w-0 flex-1">
                <Text as="p" size="sm" className="truncate font-medium">
                  {item.title}
                </Text>
                {(handle || item.description) && (
                  <Text as="p" size="xs" color="muted" className="truncate">
                    {[handle && `@${handle}`, item.description]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
              </div>
              {item.status && item.status.toLowerCase() !== 'active' ? (
                <StatusBadge status={item.status} />
              ) : null}
              {action && (
                // ui-guard-allow:selection-button -- action button showing a state, not a choice group
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                  isDisabled={isSelected || isActionPending}
                  ariaLabel={`${action.label} ${item.title}`}
                  onClick={() => onAction(action)}
                >
                  {isSelected ? 'Selected' : action.label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
function Description({ content, bridge }: DescriptionProps) {
  if (!content) return null;
  const paragraph = (
    <Text
      as="p"
      size="sm"
      className="description whitespace-pre-wrap break-words"
    >
      {content}
    </Text>
  );
  return content.length > 500 ? (
    <>
      <Text
        as="p"
        size="sm"
        className="description whitespace-pre-wrap break-words"
      >
        {content.slice(0, 280)}…
      </Text>
      <Collapsible onOpenChange={bridge.resize}>
        <CollapsibleTrigger>Read more</CollapsibleTrigger>
        <CollapsibleContent className="max-h-72 overflow-auto">
          {paragraph}
        </CollapsibleContent>
      </Collapsible>
    </>
  ) : (
    paragraph
  );
}
function usePendingCard(item: McpCard, bridge: PreviewBridge) {
  const [current, setCurrent] = useState(item);
  const [exhausted, setExhausted] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setCurrent(item);
    setExhausted(false);
    function poll(next: McpCard, attempt: number) {
      if (cancelled || !next.isPending) return;
      if (!next.id || attempt >= 60) {
        setExhausted(true);
        return;
      }
      timer = setTimeout(() => {
        bridge
          .request('tools/call', {
            name: 'get_job_status',
            arguments: { jobId: next.id },
          })
          .then((result) => {
            if (cancelled) return;
            const fresh = readView(result)?.cards[0];
            if (!fresh) {
              poll(next, attempt + 1);
              return;
            }
            const updated = { ...fresh, id: fresh.id || next.id };
            flushSync(() => setCurrent(updated));
            bridge.resize();
            poll(updated, attempt + 1);
          })
          .catch(() => {
            if (!cancelled) poll(next, attempt + 1);
          });
      }, 5000);
    }
    poll(item, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [item, bridge]);
  return { current, exhausted: exhausted || !current.id };
}
function MediaPreview({
  item,
  bridge,
  openImage,
  onError,
  isFill = false,
}: MediaPreviewProps) {
  const src =
    mediaUrl(item.url, bridge.origins) ||
    (item.kind === 'image'
      ? mediaUrl(item.thumbnailUrl, bridge.origins)
      : undefined);
  if (!src) return null;
  if (item.kind === 'image')
    return (
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        className={
          isFill ? 'zoom absolute inset-0 block size-full' : 'zoom block w-full'
        }
        ariaLabel={`Enlarge ${item.title || 'Generated image'}`}
        onClick={(event) => openImage(src, item.title, event.currentTarget)}
      >
        <Image
          src={src}
          alt={item.title || 'Generated image'}
          width={0}
          height={0}
          loading="lazy"
          fill={isFill}
          className={
            isFill
              ? 'object-cover'
              : 'mx-auto h-auto max-h-96 w-auto max-w-full rounded-lg object-contain outline-media'
          }
          onError={onError}
          onLoad={bridge.resize}
        />
      </Button>
    );
  if (item.kind === 'video')
    return (
      <VideoPlayer
        onPlaybackError={onError}
        src={src}
        ariaLabel={item.title || 'Generated video'}
        onLoad={bridge.resize}
        mediaProps={{
          onError,
          poster: mediaUrl(item.thumbnailUrl, bridge.origins),
        }}
        config={{
          controls: true,
          muted: false,
          loop: false,
          playsInline: true,
          autoPlay: false,
          preload: 'metadata',
        }}
        className={isFill ? 'absolute inset-0 size-full' : 'max-w-full'}
        mediaClassName={
          isFill ? 'size-full object-cover' : 'max-h-96 object-contain'
        }
      />
    );
  if (item.kind === 'audio')
    return (
      <MediaPlayer
        variant="row"
        stopOnUnmount
        onError={onError}
        src={src}
        label={item.title || 'Audio'}
      />
    );
  return null;
}
function SummaryCard({
  item,
  bridge,
  isActionPending,
  isSelected,
  onAction,
  resolvedDecision,
  when,
}: SummaryCardProps) {
  const avatarUrl = trustedAvatarUrl(item.avatarUrl, bridge.origins);
  const hasIdentity = Boolean(
    item.actions?.some((action) => action.kind === 'select_brand') ||
      item.avatarUrl ||
      item.hasAvatar,
  );
  const link = safeUrl(item.url);
  const handle = item.facts?.find((fact) => fact.label === 'Handle')?.value;
  const facts = (item.facts || []).filter(
    (fact) => !hasIdentity || fact.label !== 'Handle',
  );
  const metrics = item.metrics ?? [];
  const statusNode = resolvedDecision ? (
    <StatusBadge
      status={resolvedDecision === 'approve' ? 'approved' : 'rejected'}
      label={resolvedDecision === 'approve' ? 'Approved' : 'Declined'}
    />
  ) : item.status ? (
    <StatusBadge status={item.status} />
  ) : null;
  const actions = item.actions && !resolvedDecision ? item.actions : [];
  return (
    <article className="content-card min-w-0">
      <Card
        data-testid="preview-card"
        isHeaderInside
        className="h-full"
        bodyClassName="h-full"
        icon={
          hasIdentity ? (
            <Avatar
              name={item.title}
              onLoadingStatusChange={() => bridge.resize()}
              shape="square"
              size="lg"
              src={avatarUrl}
            />
          ) : item.platform ? (
            <PlatformBadge
              platform={item.platform}
              showLabel={false}
              size={ComponentSize.LG}
              variant="solid"
            />
          ) : undefined
        }
        label={item.title}
        labelAs="h2"
        isLabelWrapped
        description={
          hasIdentity && handle ? `@${handle.replace(/^@/, '')}` : undefined
        }
        headerAction={
          statusNode || (link && item.linkLabel) ? (
            <div className="flex items-center gap-1">
              {statusNode}
              {link && item.linkLabel ? (
                <IconAction
                  bridge={bridge}
                  icon={<ExternalLink aria-hidden="true" />}
                  label={item.linkLabel}
                  url={link}
                />
              ) : null}
            </div>
          ) : undefined
        }
        actions={
          actions.length
            ? [
                ...actions.map((action) => {
                  const isBrand = action.kind === 'select_brand';
                  const isDecline =
                    action.kind === 'resolve_approval' &&
                    action.decision === 'decline';
                  return (
                    // ui-guard-allow:selection-button -- action button showing a state, not a choice group
                    <Button
                      key={
                        isBrand
                          ? `${action.kind}-${action.brandId}`
                          : `${action.kind}-${action.approvalId}-${action.decision}`
                      }
                      variant={
                        (isBrand && isSelected) || isDecline
                          ? ButtonVariant.SECONDARY
                          : ButtonVariant.DEFAULT
                      }
                      withWrapper={false}
                      isDisabled={(isBrand && isSelected) || isActionPending}
                      ariaLabel={`${action.label} ${item.title}`}
                      onClick={() => onAction(action)}
                    >
                      {isBrand && isSelected ? 'Selected' : action.label}
                    </Button>
                  );
                }),
              ]
            : undefined
        }
      >
        {item.description && (
          <Description content={item.description} bridge={bridge} />
        )}
        {metrics.length ? <MetricList metrics={metrics} /> : null}
        {facts.length ? (
          <DefinitionList variant="compact" className="facts">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className={
                  fact.items?.length
                    ? 'flex flex-col gap-1.5'
                    : 'flex flex-wrap items-center gap-x-2 gap-y-1'
                }
              >
                <DefinitionTerm>{fact.label}</DefinitionTerm>
                <DefinitionDetail className="min-w-0">
                  <FactValue fact={fact} />
                </DefinitionDetail>
              </div>
            ))}
          </DefinitionList>
        ) : null}
        {when && (
          <Text size="xs" color="muted">
            {when}
          </Text>
        )}
      </Card>
    </article>
  );
}
function CardPreview({
  item,
  bridge,
  openImage,
  openArticle,
  selectedId,
  resolvedApprovals,
  isActionPending = false,
  onAction,
}: CardPreviewProps) {
  const { current, exhausted } = usePendingCard(item, bridge);
  const [failed, setFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new tool result resets the media error state.
  useEffect(() => setFailed(false), [item]);
  const isJobFailed = ['failed', 'error', 'cancelled', 'canceled'].includes(
    current.status.toLowerCase(),
  );
  const isMedia = ['image', 'video', 'audio', 'media'].includes(current.kind);
  const source =
    mediaUrl(current.url, bridge.origins) ||
    (current.kind === 'image'
      ? mediaUrl(current.thumbnailUrl, bridge.origins)
      : undefined);
  const link =
    safeUrl(current.url) ||
    (current.kind === 'image' ? safeUrl(current.thumbnailUrl) : undefined);
  const title =
    current.title && current.title !== 'Post' ? current.title : undefined;
  const when = formatDate(current.date, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const onMediaError = () => {
    setFailed(true);
    bridge.resize();
  };
  const failedNotice = failed && (
    <Text as="p" size="sm" color="muted" className="notice">
      Preview unavailable. Open the media link to view it.
    </Text>
  );
  if (current.kind === 'summary')
    return (
      <SummaryCard
        item={current}
        bridge={bridge}
        isActionPending={isActionPending}
        isSelected={Boolean(selectedId) && current.id === selectedId}
        onAction={onAction}
        resolvedDecision={
          current.actions?.[0]?.kind === 'resolve_approval'
            ? resolvedApprovals?.[current.actions[0].approvalId]
            : undefined
        }
        when={when}
      />
    );
  if (current.kind === 'post') {
    const avatarUrl = trustedAvatarUrl(
      current.author?.avatarUrl,
      bridge.origins,
    );
    const media =
      current.media ??
      (current.mediaUrl && current.mediaKind
        ? [
            {
              id: `${current.id}-media`,
              kind: current.mediaKind,
              url: current.mediaUrl,
            },
          ]
        : []);
    // A draft's date is when it was written; only a planned or live post shows it.
    const isTimed = ['scheduled', 'published'].includes(
      current.status.toLowerCase(),
    );
    const postedAt = isTimed
      ? formatDate(current.date, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';
    return (
      <article className="post min-w-0 space-y-2">
        {title && (
          <Heading as="h2" size="sm">
            {title}
          </Heading>
        )}
        <PlatformPreview
          className="min-w-0"
          headerPresentation="account"
          target={{
            id: current.id,
            platform: current.platform || 'social',
            caption: current.description,
            title,
            author: { ...current.author, avatarUrl },
            media: media.filter(
              (item): item is McpCardMedia & { kind: 'image' | 'video' } =>
                item.kind !== 'audio',
            ),
          }}
          statusLabel={
            postedAt
              ? `${current.status} · ${postedAt}`
              : current.status || 'Preview'
          }
          headerAction={
            link ? (
              <IconAction
                bridge={bridge}
                icon={<ExternalLink aria-hidden="true" />}
                label="Open published post"
                url={link}
              />
            ) : undefined
          }
          showValidation={false}
          renderMedia={(mediaItem) =>
            mediaUrl(mediaItem.url, bridge.origins) ||
            (mediaItem.kind === 'image' &&
              mediaUrl(mediaItem.thumbnailUrl, bridge.origins)) ? (
              <MediaPreview
                isFill
                item={{
                  ...current,
                  kind:
                    mediaItem.kind === 'video' ||
                    mediaItem.kind === 'short_video'
                      ? 'video'
                      : 'image',
                  title: title || platformName(current.platform),
                  url: mediaItem.url,
                  thumbnailUrl: mediaItem.thumbnailUrl,
                }}
                bridge={bridge}
                openImage={openImage}
                onError={onMediaError}
              />
            ) : (
              <Text as="p" size="xs" color="muted">
                Attachment preview unavailable
              </Text>
            )
          }
        />
        {media
          .filter((item) => item.kind === 'audio')
          .map((item) => (
            <MediaPreview
              key={item.id}
              item={{ ...current, kind: 'audio', url: item.url }}
              bridge={bridge}
              openImage={openImage}
              onError={onMediaError}
            />
          ))}
        {failedNotice}
      </article>
    );
  }
  if (current.kind === 'audio' && !current.isPending && !isJobFailed)
    return (
      <article className="media-card min-w-0">
        <Card data-testid="preview-card" padding={CardPadding.NONE}>
          <div className="relative">
            <MediaPlayer
              variant="tile"
              stopOnUnmount
              onError={onMediaError}
              src={source}
              label={current.title || 'Audio'}
              title={current.title || 'Audio'}
              meta={current.description}
              badge={
                <Badge icon={<Music aria-hidden="true" />} variant="secondary">
                  Audio
                </Badge>
              }
              className="w-full"
            />
            {link && (
              <div className="absolute top-1.5 right-1.5">
                <IconAction
                  bridge={bridge}
                  icon={<ExternalLink aria-hidden="true" />}
                  label="Open audio"
                  url={link}
                />
              </div>
            )}
          </div>
        </Card>
        {failedNotice}
      </article>
    );
  const isArticle = current.kind === 'article';
  const article = current.body || current.description;
  const headerControls = (
    <div className="flex items-center gap-1">
      {current.isPending ? (
        <StatusBadge status="processing" />
      ) : current.status &&
        !(isMedia && current.status.toLowerCase() === 'completed') ? (
        <StatusBadge status={current.status} />
      ) : null}
      {isArticle && article ? (
        <IconAction
          bridge={bridge}
          icon={<BookOpen aria-hidden="true" />}
          label="Read the full article"
          onClick={(trigger) =>
            openArticle(current.title || 'Article', article, trigger)
          }
        />
      ) : null}
      {current.kind === 'image' && source && !current.isPending && !failed ? (
        <IconAction
          bridge={bridge}
          icon={<Maximize2 aria-hidden="true" />}
          label={`Expand ${current.title || 'image'}`}
          onClick={(trigger) => openImage(source, current.title, trigger)}
        />
      ) : null}
      {link ? (
        <IconAction
          bridge={bridge}
          icon={<ExternalLink aria-hidden="true" />}
          label={isMedia ? `Open ${current.kind}` : 'Open published content'}
          url={link}
        />
      ) : null}
    </div>
  );
  return (
    <article className={`${isMedia ? 'media-card' : 'content-card'} min-w-0`}>
      <Card
        data-testid="preview-card"
        label={title}
        labelAs="h2"
        isLabelWrapped
        isHeaderInside
        gap={CardGap.SM}
        icon={
          !isMedia && current.platform ? (
            <PlatformBadge
              platform={current.platform}
              showLabel={false}
              size={ComponentSize.LG}
              variant="solid"
            />
          ) : undefined
        }
        headerAction={headerControls}
      >
        {current.isPending ? (
          <div className="pending flex flex-col gap-3">
            <Text size="xs" color="muted">
              {current.stage || 'Generating'}
            </Text>
            {(!exhausted || current.progress !== undefined) && (
              <Progress
                isIndeterminate={current.progress === undefined && !exhausted}
                value={current.progress}
                aria-label="Generation progress"
                className={`bar ${current.progress === undefined && !exhausted ? 'indeterminate' : ''}`}
              />
            )}
            <Text as="p" size="sm" color="muted" className="notice">
              {exhausted
                ? 'Still generating. Ask for the job status again to see the result.'
                : 'This preview updates when the job finishes.'}
            </Text>
          </div>
        ) : isMedia && !failed && !isJobFailed ? (
          <div className="media-preview overflow-hidden rounded-lg bg-muted/40">
            {current.kind === 'media' ? (
              <Text as="p" size="sm" color="muted" className="p-3">
                No inline preview for this file.
              </Text>
            ) : source ? (
              <MediaPreview
                item={current}
                bridge={bridge}
                openImage={openImage}
                onError={onMediaError}
              />
            ) : (
              <Text as="p" size="sm" color="muted" className="p-3">
                Attachment preview unavailable
              </Text>
            )}
          </div>
        ) : null}
        {failedNotice}
        {isMedia ? (
          current.description &&
          !current.isPending && (
            <Text as="p" size="xs" color="muted" className="line-clamp-2">
              {current.description}
            </Text>
          )
        ) : isArticle ? (
          <Text
            as="p"
            size="sm"
            className="description line-clamp-4 whitespace-pre-wrap break-words"
          >
            {current.description}
          </Text>
        ) : (
          <Description content={current.description} bridge={bridge} />
        )}
        {!isMedia && when && (
          <Text size="xs" color="muted">
            {when}
          </Text>
        )}
        {isMedia && !current.isPending && isJobFailed && (
          <Text as="p" size="sm" color="muted" className="notice">
            This job did not produce a file. Ask for the job status again or
            start a new generation.
          </Text>
        )}
      </Card>
    </article>
  );
}
function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
function localCalendarDays(days: McpCalendarDay[]) {
  const keys = new Set<string>();
  const posts = new Map<string, McpCard[]>();
  const first = parseDay(days[0]?.date || '');
  if (!Number.isNaN(first.getTime()))
    for (let offset = 0; offset < days.length; offset++) {
      const date = new Date(first);
      date.setDate(first.getDate() + offset);
      keys.add(localDayKey(date));
    }
  for (const day of days)
    for (const post of day.posts) {
      const date = new Date(post.date);
      if (Number.isNaN(date.getTime())) continue;
      const key = localDayKey(date);
      keys.add(key);
      posts.set(key, [...(posts.get(key) || []), post]);
    }
  return [...keys].sort().map((date) => ({
    date,
    posts: (posts.get(date) || []).sort((a, b) => a.date.localeCompare(b.date)),
  }));
}
function OrganizationSwitcher({
  error,
  isSwitching,
  onSwitch,
  switcher,
}: OrganizationSwitcherProps) {
  const active = switcher.choices.find(
    (choice) => choice.id === switcher.activeId,
  );
  return (
    <div className="mb-3 space-y-1.5">
      {switcher.canSwitch ? (
        <SelectField
          isDisabled={isSwitching}
          isTextCaseKept
          label="Organization"
          name="mcp-organization"
          value={switcher.activeId || undefined}
          onChange={(event) => onSwitch(event.target.value)}
        >
          {switcher.choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </SelectField>
      ) : (
        <>
          <Text size="xs" color="muted">
            Organization
          </Text>
          <Text as="p" size="sm">
            {active?.label || 'Not available'}
          </Text>
        </>
      )}
      {switcher.choices.length > 1 && !switcher.canSwitch && (
        <Text size="xs" color="muted">
          This connection is limited to one organization. Reconnect and choose
          &ldquo;All my organizations&rdquo; to move between them.
        </Text>
      )}
      {error && (
        <Text as="p" role="alert" size="xs" color="destructive">
          {error}
        </Text>
      )}
    </div>
  );
}
function Preview({ result, notice, bridge }: PreviewProps) {
  const [switched, setSwitched] = useState<McpCardView | undefined>();
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [pendingBrandId, setPendingBrandId] = useState('');
  const [resolvedApprovals, setResolvedApprovals] = useState<
    Record<string, 'approve' | 'decline'>
  >({});
  const isSelectingRef = useRef(false);
  const resultView = useMemo(() => readView(result), [result]);
  const view = switched ?? resultView;
  const [image, setImage] = useState<ImagePreview | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new tool result closes the previous media dialog.
  useEffect(() => {
    if (image && bridge.displayModes.includes('fullscreen'))
      bridge
        .request('ui/request-display-mode', { mode: 'inline' })
        .catch(() => undefined);
    setImage(null);
    setSwitched(undefined);
    setSwitchError('');
    setSelectedBrandId('');
    setResolvedApprovals({});
    bridge.resize();
  }, [result, bridge]);
  const days = localCalendarDays(view?.calendar?.days || []);
  const fallback =
    result === undefined
      ? 'Loading content…'
      : Array.isArray(record(result).content)
        ? (record(result).content as unknown[])
            .map((part) => {
              const row = record(part);
              return row.type === 'text' ? text(row.text) : '';
            })
            .filter(Boolean)
            .join('\n')
        : '';
  const emptyMessage =
    view && !notice && !view.cards.length && !days.length
      ? view.layout === 'calendar'
        ? 'No days in this calendar window.'
        : view.layout === 'organizations'
          ? 'No brands in this organization yet.'
          : 'No content found.'
      : '';
  function switchOrganization(organizationId: string) {
    if (!organizationId || organizationId === view?.organizations?.activeId)
      return;
    setIsSwitching(true);
    setSwitchError('');
    bridge
      .request('tools/call', {
        name: 'switch_org',
        arguments: { organization: organizationId },
      })
      .then((next) => {
        const fresh = readView(next);
        if (fresh?.organizations) setSwitched(fresh);
        else setSwitchError('Could not switch organization.');
      })
      .catch((error: unknown) =>
        setSwitchError(
          error instanceof Error && error.message
            ? error.message
            : 'Could not switch organization.',
        ),
      )
      .finally(() => {
        setIsSwitching(false);
        bridge.resize();
      });
  }
  function resolveApproval(
    action: Extract<McpCardAction, { kind: 'resolve_approval' }>,
  ) {
    if (isSelectingRef.current) return;
    isSelectingRef.current = true;
    setPendingBrandId(action.approvalId);
    bridge
      .request('tools/call', {
        name: 'resolve_approval',
        arguments: {
          approvalId: action.approvalId,
          decision: action.decision,
        },
      })
      .then((outcome) => {
        if (record(outcome).isError) throw new Error('blocked');
        setResolvedApprovals((current) => ({
          ...current,
          [action.approvalId]: action.decision,
        }));
        // An approved action returns its own result: show it in place.
        const fresh =
          action.decision === 'approve' ? readView(outcome) : undefined;
        if (fresh?.cards.length) setSwitched(fresh);
      })
      .catch(() =>
        bridge.notify(
          `This client could not ${action.decision} the action. Review it in Genfeed instead.`,
        ),
      )
      .finally(() => {
        isSelectingRef.current = false;
        setPendingBrandId('');
        bridge.resize();
      });
  }
  function runAction(action: McpCardAction) {
    if (action.kind === 'resolve_approval') {
      resolveApproval(action);
      return;
    }
    // One selection message per click, however fast the clicks come.
    if (isSelectingRef.current) return;
    isSelectingRef.current = true;
    setPendingBrandId(action.brandId);
    // The brand name is member-written text; the message names only the id.
    const message = `Use the brand with brandId ${action.brandId} for everything we do in this conversation. Pass that brandId to every tool that takes one.`;
    bridge
      .request('ui/message', {
        role: 'user',
        content: [{ type: 'text', text: message }],
      })
      .then((result) => {
        if (record(result).isError) throw new Error('blocked');
        setSelectedBrandId(action.brandId);
      })
      .catch(() =>
        bridge.notify(
          `This client could not send the selection. Tell your assistant: ${message}`,
        ),
      )
      .finally(() => {
        isSelectingRef.current = false;
        setPendingBrandId('');
      });
  }
  function openImage(src: string, title: string, trigger: HTMLElement) {
    returnFocus.current = trigger;
    setImage({ src, title, trigger });
    if (bridge.displayModes.includes('fullscreen'))
      bridge
        .request('ui/request-display-mode', { mode: 'fullscreen' })
        .catch(() => undefined);
  }
  function openArticle(title: string, content: string, trigger: HTMLElement) {
    returnFocus.current = trigger;
    setImage({ content, title, trigger });
    if (bridge.displayModes.includes('fullscreen'))
      bridge
        .request('ui/request-display-mode', { mode: 'fullscreen' })
        .catch(() => undefined);
  }
  function closeImage() {
    setImage(null);
    if (bridge.displayModes.includes('fullscreen'))
      bridge
        .request('ui/request-display-mode', { mode: 'inline' })
        .catch(() => undefined);
  }
  // One card carries its own header, so the view's title would only nest it.
  const isSingleCard =
    view?.layout === 'media' ||
    (view !== undefined &&
      view.layout !== 'calendar' &&
      !view.organizations &&
      view.cards.length === 1 &&
      view.total <= 1);
  const isBrandList =
    view !== undefined &&
    view.cards.length > 0 &&
    view.cards.every((item) =>
      item.actions?.some((action) => action.kind === 'select_brand'),
    );
  return (
    <>
      <div className="p-3 sm:p-4">
        <header
          className={isSingleCard ? 'sr-only' : 'mb-3 flex items-center gap-2'}
        >
          <Heading as="h1" size="md" id="title">
            {view?.title || 'Genfeed content'}
          </Heading>
          {view &&
            ['cards', 'organizations', 'posts'].includes(view.layout) &&
            !view.isCountHidden &&
            view.total > 1 && <Badge value={view.total} variant="outline" />}
        </header>
        {view?.layout === 'calendar' && (
          <div id="summary" className="mb-3 flex flex-wrap gap-2">
            <Badge variant="info" icon={<CalendarClock />}>
              {view.total} scheduled
            </Badge>
            <Badge variant="warning" icon={<CalendarOff />}>
              {days.filter((day) => !day.posts.length).length} open{' '}
              {days.filter((day) => !day.posts.length).length === 1
                ? 'day'
                : 'days'}
            </Badge>
            <Badge variant="secondary" icon={<FilePen />}>
              {view.calendar?.draftsCount || 0}{' '}
              {(view.calendar?.draftsCount || 0) === 1 ? 'draft' : 'drafts'}
            </Badge>
          </div>
        )}
        {view?.organizations && (
          <OrganizationSwitcher
            error={switchError}
            isSwitching={isSwitching}
            onSwitch={switchOrganization}
            switcher={view.organizations}
          />
        )}
        {emptyMessage ? (
          <EmptyState title={emptyMessage} />
        ) : (
          <Text
            as="p"
            role="status"
            aria-live="polite"
            size="sm"
            color="muted"
            id="notice"
            className="whitespace-pre-wrap"
          >
            {notice ||
              (!view
                ? fallback ||
                  'No preview is available. The tool result remains available in the conversation.'
                : '')}
          </Text>
        )}
        <div
          id="cards"
          className={
            view?.layout === 'calendar'
              ? 'calendar grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-2'
              : `${view?.layout === 'posts' ? 'posts' : ''} grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3`
          }
        >
          {isBrandList ? (
            <BrandList
              items={view?.cards ?? []}
              bridge={bridge}
              isActionPending={Boolean(pendingBrandId)}
              selectedId={selectedBrandId}
              onAction={runAction}
            />
          ) : view?.layout === 'calendar' ? (
            days.map((day) => (
              <section
                key={day.date}
                className="day min-w-0"
                aria-current={
                  day.date === localDayKey(new Date()) ? 'date' : undefined
                }
                aria-label={parseDay(day.date).toLocaleDateString(undefined, {
                  dateStyle: 'full',
                })}
              >
                <Card
                  labelAs="h2"
                  isLabelWrapped
                  isHeaderInside
                  isSelected={day.date === localDayKey(new Date())}
                  className={
                    day.date !== localDayKey(new Date()) && !day.posts.length
                      ? 'opacity-80'
                      : undefined
                  }
                  gap={CardGap.SM}
                  bodyClassName="min-h-24"
                  headerAction={
                    day.date === localDayKey(new Date()) ? (
                      <Badge variant="info" icon={<CalendarCheck />}>
                        Today
                      </Badge>
                    ) : undefined
                  }
                  label={parseDay(day.date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                >
                  {day.posts.length ? (
                    day.posts.map((post) => (
                      <Card
                        variant={CardVariant.INSET}
                        padding={CardPadding.SM}
                        gap={CardGap.SM}
                        className="slot"
                        key={post.id || `${post.date}-${post.description}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {post.platform && (
                            <PlatformBadge platform={post.platform} />
                          )}
                          <Text size="xs" color="muted">
                            {formatDate(post.date, { timeStyle: 'short' })}
                          </Text>
                        </div>
                        <Text as="p" size="sm" className="line-clamp-3">
                          {post.description || post.title}
                        </Text>
                      </Card>
                    ))
                  ) : (
                    <Text
                      size="xs"
                      color="muted"
                      className="rounded-lg border border-dashed border-border p-2 text-center"
                    >
                      Nothing scheduled
                    </Text>
                  )}
                </Card>
              </section>
            ))
          ) : (
            view?.cards.map((item) => (
              <CardBoundary
                key={
                  item.id ||
                  `${item.kind}-${item.title}-${item.url || item.description}`
                }
                fallback={item.description || item.title}
              >
                <CardPreview
                  item={item}
                  bridge={bridge}
                  openImage={openImage}
                  openArticle={openArticle}
                  selectedId={selectedBrandId}
                  resolvedApprovals={resolvedApprovals}
                  isActionPending={Boolean(pendingBrandId)}
                  onAction={runAction}
                />
              </CardBoundary>
            ))
          )}
        </div>
        <Text as="footer" size="xs" color="muted" id="footer" className="mt-3">
          {view && view.layout !== 'calendar' && view.total > view.cards.length
            ? `Showing ${view.cards.length} of ${view.total}. Ask for more or narrow your search.`
            : ''}
        </Text>
      </div>
      <Dialog
        open={image !== null}
        onOpenChange={(open) => {
          if (!open) closeImage();
        }}
      >
        <DialogContent
          aria-modal="true"
          showCloseButton={false}
          className={image?.content ? 'reader max-w-3xl' : 'lightbox max-w-4xl'}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeButton.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <DialogTitle>{image?.title || 'Generated image'}</DialogTitle>
          {image?.content ? (
            <Text
              as="p"
              size="sm"
              className="max-h-[75vh] overflow-auto whitespace-pre-wrap break-words leading-relaxed"
            >
              {image.content}
            </Text>
          ) : image?.src ? (
            <Image
              src={image.src}
              alt={image.title}
              width={0}
              height={0}
              className="h-auto max-h-[75vh] w-auto max-w-full object-contain"
            />
          ) : null}
          <DialogClose asChild>
            <Button
              ref={closeButton}
              withWrapper={false}
              variant={ButtonVariant.SECONDARY}
              className="close"
            >
              Close
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function mount(origins: readonly string[]) {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing preview root');
  const root = createRoot(container);
  const pending = new Map<number, PendingResponse>();
  let nextId = 1;
  let disposed = false;
  let initialized = false;
  let observer: ResizeObserver | undefined;
  let resizeFrame = 0;
  let latest: unknown;
  let notice = '';
  function send(message: Record<string, unknown>) {
    if (!disposed)
      window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
  }
  function resize() {
    if (!initialized || disposed) return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() =>
      send({
        method: 'ui/notifications/size-changed',
        params: {
          height: Math.ceil(document.body.getBoundingClientRect().height),
        },
      }),
    );
  }
  const bridge: PreviewBridge = {
    origins,
    displayModes: [],
    resize,
    request(method, params) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('The host did not respond.'));
        }, 10000);
        pending.set(id, { resolve, reject, timer });
        send({ id, method, params });
      });
    },
    notify(message) {
      notice = message;
      render();
    },
  };
  function render() {
    if (!disposed) {
      flushSync(() =>
        root.render(
          <NextIntlClientProvider
            locale="en"
            timeZone="UTC"
            messages={{ ui: { platformPreview: uiMessages.platformPreview } }}
          >
            <Preview result={latest} notice={notice} bridge={bridge} />
          </NextIntlClientProvider>,
        ),
      );
      resize();
    }
  }
  function applyContext(value: unknown) {
    const context = record(value);
    if (['light', 'dark'].includes(text(context.theme))) {
      document.body.dataset.theme = text(context.theme);
      document.documentElement.dataset.theme = text(context.theme);
      document.documentElement.style.colorScheme = text(context.theme);
    }
    if (Array.isArray(context.availableDisplayModes))
      bridge.displayModes = context.availableDisplayModes.filter(
        (mode): mode is string => typeof mode === 'string',
      );
  }
  function dispose() {
    disposed = true;
    observer?.disconnect();
    cancelAnimationFrame(resizeFrame);
    for (const media of document.querySelectorAll<HTMLMediaElement>(
      'video,audio',
    )) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
    flushSync(() => root.unmount());
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('View closed.'));
    }
    pending.clear();
    window.removeEventListener('message', onMessage);
  }
  function onMessage(event: MessageEvent<unknown>) {
    const message = record(event.data);
    if (event.source !== window.parent || message.jsonrpc !== '2.0' || disposed)
      return;
    if (
      typeof message.id === 'number' &&
      pending.has(message.id) &&
      !message.method
    ) {
      const entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(message.id);
      if (message.error)
        entry.reject(new Error(text(record(message.error).message)));
      else entry.resolve(message.result);
      return;
    }
    if (message.method === 'ui/notifications/tool-result') {
      latest = message.params;
      notice = '';
      render();
    } else if (message.method === 'ui/notifications/tool-input') {
      if (latest === undefined) {
        notice = 'Working on it…';
        render();
      }
    } else if (message.method === 'ui/notifications/tool-cancelled') {
      latest = {};
      notice = 'Request cancelled.';
      render();
    } else if (message.method === 'ui/notifications/host-context-changed')
      applyContext(message.params);
    else if (message.method === 'ui/resource-teardown') {
      if (message.id !== undefined) send({ id: message.id, result: {} });
      dispose();
    } else if (message.method === 'ping' && message.id !== undefined)
      send({ id: message.id, result: {} });
    else if (typeof message.id === 'number' && message.method)
      send({
        id: message.id,
        error: { code: -32601, message: 'Method not supported' },
      });
  }
  render();
  window.addEventListener('message', onMessage);
  bridge
    .request('ui/initialize', {
      appInfo: { name: 'Genfeed content cards', version: '5.0.0' },
      appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
      protocolVersion: '2026-01-26',
    })
    .then((result) => {
      if (disposed) return;
      applyContext(record(result).hostContext);
      initialized = true;
      send({ method: 'ui/notifications/initialized', params: {} });
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(resize);
        observer.observe(document.body);
      }
      document.fonts?.ready.then(resize);
      resize();
    })
    .catch(() => {
      if (!disposed)
        bridge.notify(
          'This client could not initialize the preview. Use the tool result in the conversation.',
        );
    });
}
