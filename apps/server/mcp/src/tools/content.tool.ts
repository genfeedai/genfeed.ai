import type { ClientService } from '@mcp/services/client.service';
import { formatListResult } from '@mcp/shared/utils/format-list-result.util';

export const CONTENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'create_article',
  'create_article_draft',
  'get_article_preview',
  'publish_article',
  'get_articles',
  'generate_linkedin_content',
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

export async function handleContentTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'create_article_draft': {
      const label = requireArticleString(args, 'label', 200);
      const slug = requireArticleString(args, 'slug', 160);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
        throw new Error('Invalid article slug');
      const summary = requireArticleString(args, 'summary', 500);
      const content = requireArticleString(args, 'content', 250000);
      const coverImageUrl =
        args.coverImageUrl === undefined
          ? undefined
          : requireArticleString(args, 'coverImageUrl', 2048);
      if (coverImageUrl && new URL(coverImageUrl).protocol !== 'https:')
        throw new Error('Cover image must use HTTPS');
      const article = await client.createArticleDraft({
        label,
        slug,
        summary,
        content,
        ...(coverImageUrl ? { coverImageUrl } : {}),
      });
      return {
        structuredContent: { data: article },
        content: [
          {
            type: 'text' as const,
            text: `Reviewed article saved as a draft. ID: ${article.id}. Get a preview before requesting publication.`,
          },
        ],
      };
    }
    case 'get_article_preview': {
      const articleId = requireArticleString(args, 'articleId', 160);
      const preview = await client.getArticlePreview(articleId);
      return {
        structuredContent: { data: preview },
        content: [
          {
            type: 'text' as const,
            text: `Private article preview (expires in ${preview.expiresInSeconds} seconds): ${preview.url}`,
          },
        ],
      };
    }
    case 'publish_article': {
      const articleId = requireArticleString(args, 'articleId', 160);
      const article = await client.publishArticle(articleId);
      return {
        structuredContent: { data: article },
        content: [
          {
            type: 'text' as const,
            text: `Article publication status: ${article.status}. ID: ${article.id}.`,
          },
        ],
      };
    }
    case 'create_article': {
      if (!args?.topic) {
        throw new Error('topic required');
      }
      const article = await client.createArticle({
        keywords: args.keywords as string[] | undefined,
        length: args.length as 'short' | 'medium' | 'long' | undefined,
        targetAudience: args.targetAudience as string | undefined,
        tone: args.tone as
          | 'professional'
          | 'casual'
          | 'humorous'
          | 'technical'
          | 'storytelling'
          | undefined,
        topic: args.topic as string,
      });

      return {
        structuredContent: { data: article },
        content: [
          {
            text: `Article created successfully!\n\nArticle ID: ${article.id}\nTitle: ${article.title}\nStatus: ${article.status}\nWord Count: ${article.wordCount}`,
            type: 'text' as const,
          },
        ],
      };
    }
    case 'get_articles': {
      const articleId =
        typeof args?.articleId === 'string' ? args.articleId.trim() : '';
      const query = typeof args?.query === 'string' ? args.query.trim() : '';
      if (Boolean(articleId) === Boolean(query)) {
        throw new Error('Pass exactly one of articleId or query');
      }
      if (articleId) {
        if (args.category !== undefined || args.limit !== undefined) {
          throw new Error('category and limit apply only to a query search');
        }
        const article = await client.getArticle(articleId);
        return {
          structuredContent: { data: article },
          content: [
            {
              text: `Article: ${article.title}\n\nID: ${article.id}\nStatus: ${article.status}\nWord Count: ${article.wordCount}\nCreated: ${article.createdAt}\n\nContent Preview:\n${article.content?.substring(0, 500)}...`,
              type: 'text' as const,
            },
          ],
        };
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
    case 'generate_linkedin_content': {
      if (!args?.topic) {
        throw new Error('topic is required');
      }
      const linkedInContent = await client.generateLinkedInContent({
        brandId: args.brandId as string | undefined,
        topic: args.topic as string,
        variationsCount: (args.variationsCount as number) || 3,
      });
      return {
        content: [
          {
            text:
              linkedInContent.length > 0
                ? `Generated ${linkedInContent.length} LinkedIn content variations:\n\n${JSON.stringify(linkedInContent, null, 2)}`
                : 'No content generated.',
            type: 'text' as const,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown content tool: ${name}`);
  }
}
