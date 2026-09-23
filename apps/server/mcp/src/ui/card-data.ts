import type { McpToolOutput } from '@genfeedai/actions';
import type {
  McpAppResult,
  McpCard,
  McpCardKind,
  McpCardView,
} from '@mcp/shared/interfaces/mcp-app.interface';

export const MCP_CARD_RESOURCE_URI = 'ui://genfeed/content-cards-v1.html';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

const TOOL_KINDS: Readonly<Record<string, McpCardKind>> = {
  create_article: 'article',
  create_post: 'post',
  generate_image: 'image',
  generate_music: 'audio',
  generate_video: 'video',
  generate_voice: 'audio',
  get_article: 'article',
  get_job_status: 'media',
  get_post: 'post',
  get_usage_stats: 'usage',
  get_video_status: 'video',
  list_avatars: 'image',
  list_images: 'image',
  list_music: 'audio',
  list_posts: 'post',
  list_videos: 'video',
  search_articles: 'article',
};

export function withCardMetadata(tool: McpToolOutput): McpToolOutput {
  if (!TOOL_KINDS[tool.name] && tool.name !== 'resolve_approval') return tool;
  return {
    ...tool,
    _meta: { ...tool._meta, ui: { resourceUri: MCP_CARD_RESOURCE_URI } },
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

function card(row: Record<string, unknown>, kind: McpCardKind): McpCard {
  return {
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
    id: text(row, 'id', 'assetId', 'ingredientId', 'postId', 'jobId'),
    kind: cardKind(row, kind),
    platform: text(row, 'platform'),
    status: text(row, 'status', 'state', 'executionState'),
    thumbnailUrl: safeCardUrl(
      text(row, 'thumbnailUrl', 'thumbnail', 'posterUrl'),
    ),
    title: (
      text(row, 'title', 'label', 'name') ||
      `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
    ).slice(0, 240),
    url: safeCardUrl(text(row, 'url', 'cdnUrl', 'publishedUrl')),
  };
}

export function buildCardView(
  name: string,
  payload: unknown,
): McpCardView | undefined {
  const kind = TOOL_KINDS[name];
  if (!kind) return undefined;
  const data = record(payload);
  if (kind === 'usage') {
    const metrics = {
      ...record(data.contentCreated),
      creditsUsed: data.creditsUsed,
      postsPublished: data.postsPublished,
      totalEngagement: data.totalEngagement,
    };
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
    return {
      cards,
      title: `Usage${text(data, 'timeRange') ? ` · ${text(data, 'timeRange')}` : ''}`,
      total: cards.length,
    };
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
