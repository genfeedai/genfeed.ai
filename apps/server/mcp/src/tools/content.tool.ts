import { McpToolInputError } from '@genfeedai/actions';
import type { ClientService } from '@mcp/services/client.service';
import { formatListResult } from '@mcp/shared/utils/format-list-result.util';
import {
  CONTENT_CAMPAIGN_TOOL_NAMES,
  handleContentCampaignTool,
} from '@mcp/tools/content-campaign.tool';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CONTENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  ...CONTENT_CAMPAIGN_TOOL_NAMES,
  'create_article_draft',
  'update_article_draft',
  'get_article_preview',
  'publish_article',
  'get_articles',
  'delete_post',
  'delete_asset',
]);

function requireArticleString(
  args: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength)
    throw new McpToolInputError(
      `${key} must be a nonempty string of at most ${maxLength} characters`,
      key,
    );
  return value;
}

function invalidSlug(): McpToolInputError {
  return new McpToolInputError(
    'slug must be lowercase letters and digits separated by single hyphens, for example my-article',
    'slug',
  );
}

function readOptionalBrandId(
  args: Record<string, unknown>,
): string | undefined {
  return args.brandId === undefined
    ? undefined
    : requireArticleString(args, 'brandId', 160);
}

function readHttpsUrl(args: Record<string, unknown>, key: string) {
  const value = requireArticleString(args, key, 2048);
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new McpToolInputError(`${key} must be an absolute HTTPS URL`, key);
  }
  if (protocol !== 'https:') {
    throw new McpToolInputError(`${key} must use HTTPS`, key);
  }
  return value;
}

const PUBLISH_WEEKDAYS_UTC = new Set([2, 4]);
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T/;

function readPublishedAt(args: Record<string, unknown>): string {
  const value = requireArticleString(args, 'publishedAt', 64);
  const date = new Date(value);
  if (
    Number.isNaN(date.getTime()) ||
    !ISO_DATE_TIME_PATTERN.test(value) ||
    !PUBLISH_WEEKDAYS_UTC.has(date.getUTCDay())
  ) {
    throw new McpToolInputError(
      'publishedAt must be an ISO 8601 timestamp that falls on a Tuesday or Thursday (UTC), for example 2026-11-17T08:00:00.000Z',
      'publishedAt',
    );
  }
  return date.toISOString();
}

export async function handleContentTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'manage_campaign':
      return handleContentCampaignTool(client, name, args);
    case 'create_article_draft': {
      const label = requireArticleString(args, 'label', 200);
      const slug = requireArticleString(args, 'slug', 160);
      if (!SLUG_PATTERN.test(slug)) throw invalidSlug();
      const summary = requireArticleString(args, 'summary', 500);
      const content = requireArticleString(args, 'content', 250000);
      const coverImageUrl =
        args.coverImageUrl === undefined
          ? undefined
          : readHttpsUrl(args, 'coverImageUrl');
      const brandId = readOptionalBrandId(args);
      const article = await client.createArticleDraft({
        label,
        slug,
        summary,
        content,
        ...(coverImageUrl ? { coverImageUrl } : {}),
        ...(brandId ? { brandId } : {}),
      });
      return {
        structuredContent: { data: article },
        content: [
          {
            type: 'text' as const,
            text: 'Reviewed article saved as a draft. Get a preview before requesting publication.',
          },
        ],
      };
    }
    case 'update_article_draft': {
      const articleId = requireArticleString(args, 'articleId', 160);
      const brandId = readOptionalBrandId(args);
      const label =
        args.label === undefined
          ? undefined
          : requireArticleString(args, 'label', 200);
      const slug =
        args.slug === undefined
          ? undefined
          : requireArticleString(args, 'slug', 160);
      if (slug !== undefined && !SLUG_PATTERN.test(slug)) throw invalidSlug();
      const summary =
        args.summary === undefined
          ? undefined
          : requireArticleString(args, 'summary', 500);
      const content =
        args.content === undefined
          ? undefined
          : requireArticleString(args, 'content', 250000);
      const coverImageUrl =
        args.coverImageUrl === undefined
          ? undefined
          : readHttpsUrl(args, 'coverImageUrl');
      const publishedAt =
        args.publishedAt === undefined ? undefined : readPublishedAt(args);
      if (
        label === undefined &&
        slug === undefined &&
        summary === undefined &&
        content === undefined &&
        coverImageUrl === undefined &&
        publishedAt === undefined
      ) {
        throw new McpToolInputError(
          'Pass at least one of label, slug, summary, content, coverImageUrl or publishedAt to change',
          'label',
        );
      }
      const article = await client.updateArticle({
        articleId,
        ...(brandId ? { brandId } : {}),
        ...(label === undefined ? {} : { label }),
        ...(slug === undefined ? {} : { slug }),
        ...(summary === undefined ? {} : { summary }),
        ...(content === undefined ? {} : { content }),
        ...(coverImageUrl === undefined ? {} : { coverImageUrl }),
        ...(publishedAt === undefined ? {} : { publishedAt }),
      });
      return {
        structuredContent: { data: article },
        content: [
          {
            type: 'text' as const,
            text: `Article updated (status ${article.status}). It was not published; get a preview before requesting publication.`,
          },
        ],
      };
    }
    case 'get_article_preview': {
      const articleId = requireArticleString(args, 'articleId', 160);
      const preview = await client.getArticlePreview(
        articleId,
        readOptionalBrandId(args),
      );
      return {
        structuredContent: { data: preview },
        content: [
          {
            type: 'text' as const,
            text: `Private article preview (expires in ${preview.expiresInSeconds} seconds). [Open preview](${preview.url})`,
          },
        ],
      };
    }
    case 'publish_article': {
      const articleId = requireArticleString(args, 'articleId', 160);
      const article = await client.publishArticle(
        articleId,
        readOptionalBrandId(args),
      );
      return {
        structuredContent: { data: article },
        content: [
          {
            type: 'text' as const,
            text: `Article publication status: ${article.status}.`,
          },
        ],
      };
    }
    case 'delete_post': {
      const postId = requireArticleString(args, 'postId', 160);
      const brandId = readOptionalBrandId(args);
      for (const flag of ['deleteMedia', 'deleteOnPlatform']) {
        if (args[flag] !== undefined && typeof args[flag] !== 'boolean') {
          throw new McpToolInputError(`${flag} must be true or false`, flag);
        }
      }
      const removal = await client.deletePost({
        ...(brandId ? { brandId } : {}),
        ...(args.deleteMedia === true ? { deleteMedia: true } : {}),
        ...(args.deleteOnPlatform === true ? { deleteOnPlatform: true } : {}),
        postId,
      });
      const media = removal.media;
      const mediaLine =
        media.deleted.length > 0 || media.kept.length > 0
          ? ` Library media deleted: ${media.deleted.length}; kept: ${media.kept.length}${
              media.kept.length > 0
                ? ` (${media.kept.map((kept) => `${kept.id}: ${kept.reason}`).join(', ')})`
                : ''
            }.`
          : '';
      return {
        structuredContent: { data: removal },
        content: [
          {
            type: 'text' as const,
            text:
              `Post ${removal.postId} (was ${removal.previousStatus}) is deleted from Genfeed.` +
              mediaLine +
              (removal.deletedOnPlatform
                ? ` It is also deleted on ${removal.platform ?? 'the social network'}.`
                : removal.previousStatus === 'public' || removal.publishedUrl
                  ? ' It was not deleted on the social network: the owner removes that copy there, or repeat with deleteOnPlatform true where the platform supports it (X, Mastodon).'
                  : '') +
              (removal.verified.postGone && removal.verified.mediaGone
                ? ' Read back: the post and its deleted media are gone.'
                : ' Read back FAILED: the post or its media still resolves. Do not report it deleted; check with get_content(action=posts) and get_assets.'),
          },
        ],
      };
    }
    case 'delete_asset': {
      const assetId = requireArticleString(args, 'assetId', 160);
      const removal = await client.deleteAsset(assetId);
      return {
        structuredContent: { data: removal },
        content: [
          {
            type: 'text' as const,
            text: removal.verified
              ? `Library asset ${assetId} is deleted. Read back: it no longer resolves.`
              : `Library asset ${assetId} was deleted but still resolves on read-back. Do not report it deleted; check with get_assets.`,
          },
        ],
      };
    }
    case 'get_articles': {
      const articleId =
        typeof args?.articleId === 'string' ? args.articleId.trim() : '';
      const query = typeof args?.query === 'string' ? args.query.trim() : '';
      const hasArticleId = Object.hasOwn(args, 'articleId');
      const hasQuery = Object.hasOwn(args, 'query');
      if (
        hasArticleId === hasQuery ||
        (hasArticleId && !articleId) ||
        (hasQuery && !query)
      ) {
        throw new McpToolInputError(
          'Pass exactly one of articleId or query: articleId reads one article, query searches published articles',
          hasArticleId ? 'articleId' : 'query',
        );
      }
      if (articleId) {
        if (args.category !== undefined || args.limit !== undefined) {
          throw new McpToolInputError(
            'category and limit apply only to a query search; drop them when reading one article by articleId',
            args.category !== undefined ? 'category' : 'limit',
          );
        }
        const article = await client.getArticle(
          articleId,
          readOptionalBrandId(args),
        );
        return {
          structuredContent: { data: article },
          content: [
            {
              text: `Article: ${article.title}\n\nStatus: ${article.status}\nWord Count: ${article.wordCount}\nCreated: ${article.createdAt}\n\nContent Preview:\n${article.content?.substring(0, 500)}...`,
              type: 'text' as const,
            },
          ],
        };
      }
      if (args.brandId !== undefined) {
        throw new McpToolInputError(
          'brandId applies only when reading one article by articleId. A query search covers the whole organization: drop brandId.',
          'brandId',
        );
      }
      const articles = await client.searchArticles({
        category: args.category as string | undefined,
        limit: args.limit as number | undefined,
        query,
      });

      return {
        structuredContent: { data: articles },
        content: [
          {
            text: formatListResult(
              articles,
              'articles',
              ` matching "${query}"`,
            ),
            type: 'text' as const,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown content tool: ${name}`);
  }
}
