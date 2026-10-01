import type { ClientService } from '@mcp/services/client.service';
import { formatListResult } from '@mcp/shared/utils/format-list-result.util';

export const CONTENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'create_article',
  'search_articles',
  'get_article',
  'generate_linkedin_content',
]);

export async function handleContentTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
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
    case 'search_articles': {
      if (!args?.query) {
        throw new Error('query required');
      }
      const articles = await client.searchArticles({
        category: args.category as string | undefined,
        limit: args.limit as number | undefined,
        query: args.query as string,
      });

      return {
        structuredContent: { data: articles },
        content: [
          {
            text: formatListResult(
              articles,
              'articles',
              ` matching "${args.query}"`,
            ),
            type: 'text' as const,
          },
        ],
      };
    }
    case 'get_article': {
      if (!args?.articleId) {
        throw new Error('articleId required');
      }
      const article = await client.getArticle(args.articleId as string);
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
