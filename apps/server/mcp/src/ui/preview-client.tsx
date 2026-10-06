import '@mcp/ui/preview-runtime';
import { ButtonVariant } from '@genfeedai/contracts';
import type {
  McpCalendarDay,
  McpCard,
  McpCardView,
} from '@mcp/shared/interfaces/mcp-app.interface';
import type {
  CardPreviewProps,
  DescriptionProps,
  ImagePreview,
  MediaPreviewProps,
  PendingResponse,
  PreviewBridge,
  PreviewProps,
} from '@mcp/shared/interfaces/mcp-preview.interface';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Card from '@ui/card/Card';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Avatar, AvatarFallback } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Progress } from '@ui/primitives/progress';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
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
    !['post', 'article', 'image', 'video', 'audio', 'media', 'usage'].includes(
      text(row.kind),
    )
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
    mediaKind: ['image', 'video', 'audio'].includes(text(row.mediaKind))
      ? (row.mediaKind as McpCard['mediaKind'])
      : undefined,
    attachments: Array.isArray(row.attachments)
      ? row.attachments.filter((kind): kind is 'image' | 'video' | 'audio' =>
          ['image', 'video', 'audio'].includes(text(kind)),
        )
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
function readView(result: unknown): McpCardView | undefined {
  const data = record(result);
  const view = record(record(data.structuredContent).genfeedCards);
  if (data.isError || !Array.isArray(view.cards)) return undefined;
  const calendar = record(view.calendar);
  return {
    cards: cards(view.cards),
    title: text(view.title) || 'Genfeed content',
    total:
      typeof view.total === 'number' && Number.isFinite(view.total)
        ? Math.max(0, view.total)
        : view.cards.length,
    layout: ['posts', 'media', 'calendar'].includes(text(view.layout))
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
  const names: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    pinterest: 'Pinterest',
    reddit: 'Reddit',
    threads: 'Threads',
    tiktok: 'TikTok',
    twitter: 'X',
    x: 'X',
    youtube: 'YouTube',
  };
  return (
    names[value.toLowerCase()] ||
    (value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Post')
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
        <img
          src={src}
          alt={item.title || 'Generated image'}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="max-h-80 max-w-full rounded-card object-contain outline-media"
          onError={onError}
          onLoad={bridge.resize}
        />
      </Button>
    );
  if (item.kind === 'video')
    return (
      <VideoPlayer
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
function CardPreview({ item, bridge, openImage }: CardPreviewProps) {
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
  return (
    <article
      className={`${isPost ? 'post' : isMedia ? 'media-card' : 'content-card'} min-w-0`}
    >
      <Card
        data-testid="preview-card"
        label={title}
        bodyClassName="gap-3"
        headerAction={
          isPost && current.status ? (
            <Badge variant="outline" className="status">
              {current.status}
            </Badge>
          ) : undefined
        }
      >
        {isPost && (
          <div className="post-head flex items-center gap-3">
            <Avatar className="avatar size-8">
              <AvatarFallback>
                {platformName(current.platform).charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="who flex min-w-0 flex-col">
              <Text as="strong" weight="medium" size="sm">
                {platformName(current.platform)}
              </Text>
              {when && (
                <Text size="xs" color="muted">
                  {when}
                </Text>
              )}
            </div>
          </div>
        )}
        {current.isPending ? (
          <div className="pending flex flex-col gap-3">
            <Text size="xs" color="muted">
              {current.stage || 'Generating'}
            </Text>
            <Progress
              isIndeterminate={current.progress === undefined && !exhausted}
              value={current.progress}
              aria-label="Generation progress"
              className={`bar ${current.progress === undefined && !exhausted ? 'indeterminate' : ''}`}
            />
            <Text as="p" size="sm" color="muted" className="notice">
              {exhausted
                ? 'Still generating. Ask for the job status again to see the result.'
                : 'This preview updates when the job finishes.'}
            </Text>
          </div>
        ) : isMedia && !failed ? (
          <div className="media-preview">{player}</div>
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
        ) : current.kind === 'usage' ? (
          <Heading as="p" size="2xl" className="metric">
            {current.description}
          </Heading>
        ) : (
          <Description content={current.description} bridge={bridge} />
        )}
        {!isPost && !isMedia && (
          <Text size="xs" color="muted">
            {[current.kind, current.platform, current.status, current.id, when]
              .filter(Boolean)
              .join(' · ')}
          </Text>
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
        {isPost && !failed && current.mediaUrl && current.mediaKind && (
          <div className="media-frame">
            <MediaPreview
              item={{
                ...current,
                kind: current.mediaKind,
                url: current.mediaUrl,
              }}
              bridge={bridge}
              openImage={openImage}
              onError={() => {
                setFailed(true);
                bridge.resize();
              }}
            />
          </div>
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
function Preview({ result, notice, bridge }: PreviewProps) {
  const view = useMemo(() => readView(result), [result]);
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
          hidden={view?.layout === 'media'}
          className="mb-3 flex items-baseline justify-between gap-3"
        >
          <Heading as="h1" size="md" id="title">
            {view?.title || 'Genfeed content'}
          </Heading>
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
              : view.cards.length || days.length
                ? ''
                : view.layout === 'calendar'
                  ? 'No days in this calendar window.'
                  : 'No content found.')}
        </Text>
        <div
          id="cards"
          className={
            view?.layout === 'calendar'
              ? 'calendar grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-2'
              : `${view?.layout === 'posts' ? 'posts' : ''} grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3`
          }
        >
          {view?.layout === 'calendar'
            ? days.map((day) => (
                <section
                  key={day.date}
                  className={`day ${day.posts.length ? '' : 'gap'} ${day.date === localDayKey(new Date()) ? 'today' : ''}`}
                  aria-label={parseDay(day.date).toLocaleDateString(undefined, {
                    dateStyle: 'full',
                  })}
                >
                  <Card
                    bodyClassName="min-h-24 gap-2"
                    label={parseDay(day.date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  >
                    {day.posts.length ? (
                      day.posts.map((post) => (
                        <div
                          className="slot space-y-1"
                          key={post.id || `${post.date}-${post.description}`}
                        >
                          <Text size="xs" color="muted">
                            {formatDate(post.date, { timeStyle: 'short' })} ·{' '}
                            {platformName(post.platform)}
                          </Text>
                          <Text as="p" size="sm" className="line-clamp-3">
                            {post.description || post.title}
                          </Text>
                        </div>
                      ))
                    ) : (
                      <Text size="xs" color="muted">
                        Nothing scheduled
                      </Text>
                    )}
                  </Card>
                </section>
              ))
            : view?.cards.map((item) => (
                <CardPreview
                  key={
                    item.id ||
                    `${item.kind}-${item.title}-${item.url || item.description}`
                  }
                  item={item}
                  bridge={bridge}
                  openImage={openImage}
                />
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
            <img
              src={image.src}
              alt={image.title}
              referrerPolicy="no-referrer"
              className="max-h-[75vh] max-w-full object-contain"
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
          <Preview result={latest} notice={notice} bridge={bridge} />,
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
