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
]);

function requireArticleString(
  args: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength)
    throw new Error(
      `${key} must be a nonempty string of at most ${maxLength} characters`,
    );
  return value;
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
    throw new Error(`${key} must be an absolute HTTPS URL`);
  }
  if (protocol !== 'https:') throw new Error('Cover image must use HTTPS');
  return value;
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
      if (!SLUG_PATTERN.test(slug)) throw new Error('Invalid article slug');
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
      if (slug !== undefined && !SLUG_PATTERN.test(slug))
        throw new Error('Invalid article slug');
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
      if (
        label === undefined &&
        slug === undefined &&
        summary === undefined &&
        content === undefined &&
        coverImageUrl === undefined
      ) {
        throw new Error(
          'Pass at least one of label, slug, summary, content or coverImageUrl to change',
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
        throw new Error('Pass exactly one of articleId or query');
      }
      if (articleId) {
        if (args.category !== undefined || args.limit !== undefined) {
          throw new Error('category and limit apply only to a query search');
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
        throw new Error('brandId applies only when reading one article');
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
