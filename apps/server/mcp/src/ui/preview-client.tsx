import '@mcp/ui/preview-runtime';
import { ButtonVariant, formatPlatformLabel } from '@genfeedai/contracts';
import type {
  McpCalendarDay,
  McpCard,
  McpCardAction,
  McpCardMedia,
  McpCardView,
  McpOrganizationSwitcher,
} from '@mcp/shared/interfaces/mcp-app.interface';
import type {
  CardPreviewProps,
  DescriptionProps,
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
import uiMessages from '@preview-messages/ui';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
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
import { Progress } from '@ui/primitives/progress';
import { SelectField } from '@ui/primitives/select';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
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
function safeUrl(value: unknown): string | undefined {
  try {
    const url = new URL(text(value));
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
function mediaUrl(
  value: unknown,
  origins: readonly string[],
): string | undefined {
  const url = safeUrl(value);
  return url && origins.includes(new URL(url).origin) ? url : undefined;
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
    kind: row.kind as McpCard['kind'],
    status: text(row.status),
    platform: text(row.platform),
    date: text(row.date),
    url: safeUrl(row.url),
    thumbnailUrl: safeUrl(row.thumbnailUrl),
    mediaUrl: safeUrl(row.mediaUrl),
    avatarUrl: safeUrl(row.avatarUrl),
    actions: Array.isArray(row.actions)
      ? row.actions.slice(0, 4).flatMap((value) => {
          const item = record(value);
          return item.kind === 'select_brand' && text(item.brandId)
            ? [
                {
                  kind: 'select_brand' as const,
                  brandId: text(item.brandId),
                  label: text(item.label) || 'Select',
                },
              ]
            : [];
        })
      : undefined,
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
    facts: Array.isArray(row.facts)
      ? row.facts.slice(0, 12).flatMap((value) => {
          const item = record(value);
          return text(item.label) && text(item.value)
            ? [{ label: text(item.label), value: text(item.value) }]
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
  if (data.isError || !Array.isArray(view.cards)) return undefined;
  const calendar = record(view.calendar);
  return {
    organizations: readOrganizations(view.organizations),
    cards: cards(view.cards),
    title: text(view.title) || 'Genfeed content',
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
function MediaPreview({ item, bridge, openImage, onError }: MediaPreviewProps) {
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
        className="zoom block max-w-full"
        ariaLabel={`Enlarge ${item.title || 'Generated image'}`}
        onClick={(event) => openImage(src, item.title, event.currentTarget)}
      >
        <Image
          src={src}
          alt={item.title || 'Generated image'}
          width={0}
          height={0}
          loading="lazy"
          className="h-auto max-h-80 w-auto max-w-full rounded-card object-contain outline-media"
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
        className="max-w-full"
        mediaClassName="max-h-80 object-contain"
      />
    );
  if (item.kind === 'audio')
    return (
      <AudioPreviewPlayer
        isTimelineVisible
        stopOnUnmount
        onError={onError}
        audioUrl={src}
        label={item.title || 'Generated audio'}
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
  when,
}: SummaryCardProps) {
  const avatar = safeUrl(item.avatarUrl);
  const avatarUrl =
    avatar &&
    (mediaUrl(avatar, bridge.origins) || isAccountAvatarOrigin(new URL(avatar)))
      ? avatar
      : undefined;
  const hasIdentity = Boolean(item.actions?.length || item.avatarUrl);
  const handle = item.facts?.find((fact) => fact.label === 'Handle')?.value;
  const facts = (item.facts || []).filter(
    (fact) => !hasIdentity || fact.label !== 'Handle',
  );
  return (
    <article className="content-card min-w-0">
      <Card
        data-testid="preview-card"
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
          ) : undefined
        }
        label={item.title}
        labelAs="h2"
        isLabelWrapped
        description={
          hasIdentity && handle ? `@${handle.replace(/^@/, '')}` : undefined
        }
        headerAction={
          item.status ? (
            <Badge variant="outline" className="status shrink-0">
              {item.status}
            </Badge>
          ) : undefined
        }
        actions={
          item.actions?.length
            ? item.actions.map((action) => (
                <Button
                  key={`${action.kind}-${action.brandId}`}
                  variant={
                    isSelected ? ButtonVariant.SECONDARY : ButtonVariant.DEFAULT
                  }
                  withWrapper={false}
                  isDisabled={isSelected || isActionPending}
                  ariaLabel={`${action.label} ${item.title}`}
                  onClick={() => onAction(action)}
                >
                  {isSelected ? 'Selected' : action.label}
                </Button>
              ))
            : undefined
        }
      >
        {item.description && (
          <Description content={item.description} bridge={bridge} />
        )}
        {facts.length ? (
          <DefinitionList variant="compact" className="facts">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-wrap gap-x-2">
                <DefinitionTerm>{fact.label}</DefinitionTerm>
                <DefinitionDetail className="break-words">
                  {fact.value}
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
  selectedId,
  isActionPending = false,
  onAction,
}: CardPreviewProps) {
  const { current, exhausted } = usePendingCard(item, bridge);
  const [failed, setFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new tool result resets the media error state.
  useEffect(() => setFailed(false), [item]);
  const isPost = current.kind === 'post';
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
  const attachments = new Map<string, number>();
  for (const kind of current.attachments || [])
    attachments.set(kind, (attachments.get(kind) || 0) + 1);
  const player = (
    <MediaPreview
      item={current}
      bridge={bridge}
      openImage={openImage}
      onError={() => {
        setFailed(true);
        bridge.resize();
      }}
    />
  );
  if (current.kind === 'summary')
    return (
      <SummaryCard
        item={current}
        bridge={bridge}
        isActionPending={isActionPending}
        isSelected={Boolean(selectedId) && current.id === selectedId}
        onAction={onAction}
        when={when}
      />
    );
  if (isPost) {
    const avatar = safeUrl(current.author?.avatarUrl);
    const avatarUrl =
      avatar &&
      (mediaUrl(avatar, bridge.origins) ||
        isAccountAvatarOrigin(new URL(avatar)))
        ? avatar
        : undefined;
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
    return (
      <article className="post min-w-0 space-y-3">
        {title && (
          <Heading as="h2" size="sm">
            {title}
          </Heading>
        )}
        <PlatformPreview
          className="min-w-0"
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
          statusLabel={current.status || 'Preview'}
          showValidation={false}
          renderMedia={(mediaItem) =>
            mediaUrl(mediaItem.url, bridge.origins) ||
            (mediaItem.kind === 'image' &&
              mediaUrl(mediaItem.thumbnailUrl, bridge.origins)) ? (
              <MediaPreview
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
                onError={() => {
                  setFailed(true);
                  bridge.resize();
                }}
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
              onError={() => setFailed(true)}
            />
          ))}
        {attachments.size > 0 && (
          <div className="attachments flex flex-wrap gap-2">
            {[...attachments].map(([kind, count]) => (
              <Badge key={kind} variant="outline">
                {kind.charAt(0).toUpperCase() + kind.slice(1)}
                {count > 1 ? ` ×${count}` : ''}
              </Badge>
            ))}
          </div>
        )}
        {when && (
          <Text size="xs" color="muted">
            {when}
          </Text>
        )}
        {failed && (
          <Text as="p" size="sm" color="muted" className="notice">
            Preview unavailable. Open the media link to view it.
          </Text>
        )}
        {link && (
          <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                event.preventDefault();
                bridge
                  .request('ui/open-link', { url: link })
                  .then((result) => {
                    if (record(result).isError) throw new Error('blocked');
                  })
                  .catch(() =>
                    bridge.notify(
                      'The host could not open the link. Copy the link address to open it in your browser.',
                    ),
                  );
              }}
            >
              Open published post ↗
            </a>
          </Button>
        )}
      </article>
    );
  }
  return (
    <article
      className={`${isPost ? 'post' : isMedia ? 'media-card' : 'content-card'} min-w-0`}
    >
      <Card
        data-testid="preview-card"
        label={title}
        labelAs="h2"
        isLabelWrapped
        bodyClassName="gap-3"
        headerAction={
          !isMedia && current.status ? (
            <Badge variant="outline" className="status">
              {current.status}
            </Badge>
          ) : undefined
        }
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
        ) : isMedia && !failed ? (
          <div className="media-preview overflow-hidden rounded-lg bg-muted/40">
            {current.kind === 'media' ? (
              <Text as="p" size="sm" color="muted">
                No inline preview for this file.
              </Text>
            ) : source ? (
              player
            ) : (
              <Text as="p" size="sm" color="muted">
                Attachment preview unavailable
              </Text>
            )}
          </div>
        ) : null}
        {failed && (
          <Text as="p" size="sm" color="muted" className="notice">
            Preview unavailable. Open the media link to view it.
          </Text>
        )}
        {isMedia ? (
          current.description && (
            <Collapsible onOpenChange={bridge.resize}>
              <CollapsibleTrigger>Details</CollapsibleTrigger>
              <CollapsibleContent>
                <Description content={current.description} bridge={bridge} />
              </CollapsibleContent>
            </Collapsible>
          )
        ) : (
          <Description content={current.description} bridge={bridge} />
        )}
        {!isPost && !isMedia && (
          <div className="meta flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {current.kind.charAt(0).toUpperCase() + current.kind.slice(1)}
            </Badge>
            {current.platform && <PlatformBadge platform={current.platform} />}
            {when && (
              <Text size="xs" color="muted">
                {when}
              </Text>
            )}
          </div>
        )}
        {isMedia &&
          !current.isPending &&
          current.status &&
          ![
            'generated',
            'completed',
            'ready',
            'uploaded',
            'validated',
          ].includes(current.status.toLowerCase()) && (
            <Text as="p" size="sm" color="muted">
              {current.status}
            </Text>
          )}
        {attachments.size > 0 && (
          <div className="attachments flex flex-wrap gap-2">
            {[...attachments].map(([kind, count]) => (
              <Badge key={kind} variant="outline">
                {kind.charAt(0).toUpperCase() + kind.slice(1)}
                {count > 1 ? ` ×${count}` : ''}
              </Badge>
            ))}
          </div>
        )}
        <div className="media-actions flex flex-wrap gap-2">
          {isMedia &&
            current.kind === 'image' &&
            source &&
            !current.isPending &&
            !failed && (
              <Button
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
                ariaLabel={`Expand ${current.title}`}
                onClick={(event) =>
                  openImage(source, current.title, event.currentTarget)
                }
              >
                Expand
              </Button>
            )}
          {link && (
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  bridge
                    .request('ui/open-link', { url: link })
                    .then((result) => {
                      if (record(result).isError) throw new Error('blocked');
                    })
                    .catch(() =>
                      bridge.notify(
                        'The host could not open the link. Copy the link address to open it in your browser.',
                      ),
                    );
                }}
              >
                {isPost
                  ? 'Open published post ↗'
                  : isMedia
                    ? `Open ${current.kind} ↗`
                    : 'Open published content ↗'}
              </a>
            </Button>
          )}
        </div>
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
  function runAction(action: McpCardAction) {
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
  function closeImage() {
    setImage(null);
    if (bridge.displayModes.includes('fullscreen'))
      bridge
        .request('ui/request-display-mode', { mode: 'inline' })
        .catch(() => undefined);
  }
  return (
    <>
      <div className="p-3 sm:p-4">
        <header
          className={
            view?.layout === 'media'
              ? 'sr-only'
              : 'mb-3 flex items-baseline justify-between gap-3'
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <Heading as="h1" size="md" id="title">
              {view?.title || 'Genfeed content'}
            </Heading>
            {view &&
              ['cards', 'organizations'].includes(view.layout) &&
              view.total > 1 && <Badge variant="outline">{view.total}</Badge>}
          </div>
          <Text size="xs" color="muted">
            GENFEED
          </Text>
        </header>
        {view?.layout === 'calendar' && (
          <div id="summary" className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline">{view.total} scheduled</Badge>
            <Badge variant="outline">
              {days.filter((day) => !day.posts.length).length} open{' '}
              {days.filter((day) => !day.posts.length).length === 1
                ? 'day'
                : 'days'}
            </Badge>
            <Badge variant="outline">
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
          <CardEmptyContent label={emptyMessage} />
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
          {view?.layout === 'calendar'
            ? days.map((day) => (
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
                    className={
                      day.date === localDayKey(new Date())
                        ? 'ring-1 ring-primary/50'
                        : day.posts.length
                          ? undefined
                          : 'opacity-80'
                    }
                    bodyClassName="min-h-24 gap-2"
                    headerAction={
                      day.date === localDayKey(new Date()) ? (
                        <Badge variant="outline">Today</Badge>
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
                        <div
                          className="slot space-y-1 rounded-lg bg-muted/40 p-2"
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
                        </div>
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
            : view?.cards.map((item) => (
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
                    selectedId={selectedBrandId}
                    isActionPending={Boolean(pendingBrandId)}
                    onAction={runAction}
                  />
                </CardBoundary>
              ))}
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
          className="lightbox max-w-4xl"
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
          {image && (
            <Image
              src={image.src}
              alt={image.title}
              width={0}
              height={0}
              className="h-auto max-h-[75vh] w-auto max-w-full object-contain"
            />
          )}
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
