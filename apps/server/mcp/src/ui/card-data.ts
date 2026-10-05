import type { McpToolOutput } from '@genfeedai/actions';
import type {
  McpAppResult,
  McpCalendarDay,
  McpCard,
  McpCardKind,
  McpCardLayout,
  McpCardView,
  McpMediaKind,
} from '@mcp/shared/interfaces/mcp-app.interface';

// Bump the version whenever the view changes: hosts cache templates by URI.
export const MCP_CARD_RESOURCE_URI = 'ui://genfeed/content-cards-v3.html';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

/** Statuses of a media job that has not produced its output yet. */
const PENDING_STATUSES = new Set([
  'generating',
  'in_progress',
  'pending',
  'processing',
  'queued',
  'running',
  'started',
]);

const CALENDAR_MAX_DAYS = 31;

const TOOL_KINDS: Readonly<Record<string, McpCardKind>> = {
  create_post: 'post',
  generate: 'media',
  // Social copy renders as a post; an article result switches to the article
  // card in buildCardView via its articleId.
  generate_content: 'post',
  get_account: 'usage',
  get_articles: 'article',
  get_job_status: 'media',
  get_posts: 'post',
  list_assets: 'media',
  transform_media: 'media',
};

/** Short host status lines shown while a tool runs and once it returns. */
const INVOCATION_STATUS: Readonly<
  Record<McpCardKind, { invoked: string; invoking: string }>
> = {
  article: { invoked: 'Article ready', invoking: 'Loading articles…' },
  audio: { invoked: 'Audio ready', invoking: 'Preparing audio…' },
  image: { invoked: 'Image ready', invoking: 'Preparing image…' },
  media: { invoked: 'Media ready', invoking: 'Working on media…' },
  post: { invoked: 'Posts ready', invoking: 'Loading posts…' },
  usage: { invoked: 'Usage ready', invoking: 'Checking usage…' },
  video: { invoked: 'Video ready', invoking: 'Preparing video…' },
};

/**
 * Links a tool to the content-card view. `ui.resourceUri` is the MCP Apps
 * key; the flat `ui/resourceUri` is the legacy spelling older hosts read, and
 * `openai/outputTemplate` is the ChatGPT alias. Text `content` stays the
 * fallback for hosts that render no UI.
 */
export function withCardMetadata(tool: McpToolOutput): McpToolOutput {
  if (!TOOL_KINDS[tool.name] && tool.name !== 'resolve_approval') return tool;
  const status = INVOCATION_STATUS[TOOL_KINDS[tool.name] ?? 'post'];
  return {
    ...tool,
    _meta: {
      ...tool._meta,
      'openai/outputTemplate': MCP_CARD_RESOURCE_URI,
      'openai/toolInvocation/invoked': status.invoked,
      'openai/toolInvocation/invoking': status.invoking,
      ui: { resourceUri: MCP_CARD_RESOURCE_URI },
      'ui/resourceUri': MCP_CARD_RESOURCE_URI,
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function safeCardUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function cardKind(
  row: Record<string, unknown>,
  fallback: McpCardKind,
): McpCardKind {
  const kind = text(row, 'kind', 'assetKind', 'category').toLowerCase();
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind;
  if (kind === 'music' || kind === 'voice') return 'audio';
  if (kind === 'avatar') return 'image';
  return fallback;
}

function mediaKind(row: Record<string, unknown>): McpMediaKind | undefined {
  const kind = cardKind(row, 'media');
  return kind === 'image' || kind === 'video' || kind === 'audio'
    ? kind
    : undefined;
}

/**
 * Listed posts carry `media: [{ assetId, kind, order }]` without URLs, so the
 * preview shows what is attached; a media item that does carry a URL plays.
 */
function postMedia(row: Record<string, unknown>): Partial<McpCard> {
  if (!Array.isArray(row.media)) return {};
  const items = row.media.slice(0, 10).map(record);
  const attachments = items.flatMap((item) => {
    const kind = mediaKind(item);
    return kind ? [kind] : [];
  });
  const playable = items.find(
    (item) => mediaKind(item) && safeCardUrl(text(item, 'url', 'cdnUrl')),
  );
  return {
    ...(attachments.length ? { attachments } : {}),
    ...(playable
      ? {
          mediaKind: mediaKind(playable),
          mediaUrl: safeCardUrl(text(playable, 'url', 'cdnUrl')),
        }
      : {}),
  };
}

function progress(row: Record<string, unknown>): number | undefined {
  const value = row.progress ?? row.generationProgress;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : undefined;
}

function card(row: Record<string, unknown>, kind: McpCardKind): McpCard {
  const status = text(row, 'status', 'state', 'executionState');
  const url = safeCardUrl(text(row, 'url', 'cdnUrl', 'publishedUrl'));
  const resolvedKind = cardKind(row, kind);
  const isMedia = ['audio', 'image', 'media', 'video'].includes(resolvedKind);
  const isPending =
    isMedia && !url && PENDING_STATUSES.has(status.toLowerCase());
  const stage = text(row, 'stage', 'generationStage');
  return {
    ...(resolvedKind === 'post' ? postMedia(row) : {}),
    ...(isPending ? { isPending, progress: progress(row) } : {}),
    ...(isPending && stage ? { stage } : {}),
    date: text(row, 'scheduledDate', 'scheduledAt', 'publishedAt', 'createdAt'),
    description: text(
      row,
      'description',
      'excerpt',
      'content',
      'prompt',
      'text',
      'message',
    ).slice(0, 4000),
    id: text(
      row,
      'id',
      'assetId',
      'articleId',
      'ingredientId',
      'postId',
      'jobId',
    ),
    kind: resolvedKind,
    platform: text(row, 'platform'),
    status,
    thumbnailUrl: safeCardUrl(
      text(row, 'thumbnailUrl', 'thumbnail', 'posterUrl'),
    ),
    title: (
      text(row, 'title', 'label', 'name') ||
      `${resolvedKind.charAt(0).toUpperCase()}${resolvedKind.slice(1)}`
    ).slice(0, 240),
    url,
  };
}

function isoDay(value: unknown): string | undefined {
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10);
}

/**
 * `get_posts {days}` returns `scheduled` posts and `gapDays` for the coming
 * days. Every day in the window becomes a column: its posts, or a gap.
 */
function buildCalendarView(data: Record<string, unknown>): McpCardView {
  const scheduled = Array.isArray(data.scheduled) ? data.scheduled : [];
  const gapDays = new Set(
    (Array.isArray(data.gapDays) ? data.gapDays : []).flatMap((value) => {
      const day = isoDay(value);
      return day ? [day] : [];
    }),
  );
  const postsByDay = new Map<string, McpCard[]>();
  for (const value of scheduled.slice(0, 200)) {
    const row = record(value);
    const day = isoDay(row.scheduledDate);
    if (!day) continue;
    const post = card(row, 'post');
    postsByDay.set(day, [...(postsByDay.get(day) ?? []), post]);
  }
  const days: McpCalendarDay[] = [
    ...new Set([...gapDays, ...postsByDay.keys()]),
  ]
    .sort()
    .slice(0, CALENDAR_MAX_DAYS)
    .map((date) => {
      const posts = (postsByDay.get(date) ?? []).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      return { date, isGap: posts.length === 0, posts };
    });
  const draftsCount =
    typeof data.draftsCount === 'number' && Number.isFinite(data.draftsCount)
      ? data.draftsCount
      : 0;
  return {
    calendar: { days, draftsCount },
    cards: days.flatMap((day) => day.posts),
    layout: 'calendar',
    title: 'Content calendar',
    total: scheduled.length,
  };
}

function layoutFor(kind: McpCardKind): McpCardLayout {
  if (kind === 'post') return 'posts';
  if (kind === 'article' || kind === 'usage') return 'cards';
  return 'media';
}

export function buildCardView(
  name: string,
  payload: unknown,
): McpCardView | undefined {
  const baseKind = TOOL_KINDS[name];
  if (!baseKind) return undefined;
  const data = record(payload);
  if (name === 'get_posts' && Array.isArray(data.gapDays)) {
    return buildCalendarView(data);
  }
  const kind: McpCardKind =
    name === 'generate_content' && text(data, 'articleId')
      ? 'article'
      : baseKind;
  if (kind === 'usage') {
    // `get_account` can omit the usage section; there is nothing to chart then.
    if (!Object.keys(record(data.usage)).length) return undefined;
    const metrics = record(data.usage);
    const cards = Object.entries(metrics).flatMap(([label, value]) =>
      typeof value === 'number' && Number.isFinite(value)
        ? [
            {
              ...card({}, kind),
              description: String(value),
              title: label.replace(/([A-Z])/g, ' $1'),
            },
          ]
        : [],
    );
    return { cards, layout: 'cards', title: 'Usage', total: cards.length };
  }
  const collection = Array.isArray(payload)
    ? payload
    : [
        'posts',
        'images',
        'videos',
        'articles',
        'music',
        'avatars',
        'items',
        'assets',
        'characters',
      ]
        .map((key) => data[key])
        .find(Array.isArray);
  const rows =
    collection ??
    (Object.keys(data).length ? [data.post ?? data.article ?? data] : []);
  const cards = rows.slice(0, 24).map((value) => card(record(value), kind));
  const count =
    typeof data.total === 'number' && Number.isFinite(data.total)
      ? data.total
      : rows.length;
  return {
    cards,
    layout: layoutFor(kind),
    title: name.replace(/_/g, ' '),
    total: Math.max(count, rows.length),
  };
}

export function withCardResult<T extends McpAppResult>(
  name: string,
  result: T,
) {
  if (result.isError || !result.structuredContent) return result;
  const view = buildCardView(name, result.structuredContent.data);
  if (!view) return result;
  return {
    ...result,
    structuredContent: { ...result.structuredContent, genfeedCards: view },
  };
}
