import type { ClientService } from '@mcp/services/client.service';
import { formatListResult } from '@mcp/shared/utils/format-list-result.util';

/**
 * Names handled by the legacy MCP switch. This set is the classification
 * source of truth for that branch; the switch must handle exactly these names
 * (asserted by the drift guard + `tool-registry.dispatch.spec`).
 */
export const LEGACY_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'get_video_status',
  'list_videos',
  'get_video_analytics',
  'create_article',
  'search_articles',
  'get_article',
  'list_images',
  'list_avatars',
  'list_music',
  'get_workflow_status',
  'list_workflow_templates',
  'get_content_analytics',
  'get_usage_stats',
  'generate_linkedin_content',
  'get_linkedin_connection_status',
  'get_linkedin_analytics',
]);

/** Executed only after classify() has already chosen the legacy executor. */
export async function handleLegacyTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'get_video_status':
    case 'list_videos':
    case 'get_video_analytics':
      return handleLegacyVideoTools(client, name, args);
    case 'create_article':
    case 'search_articles':
    case 'get_article':
      return handleLegacyArticleTools(client, name, args);
    case 'list_images':
    case 'list_avatars':
    case 'list_music':
      return handleLegacyLibraryTools(client, name, args);
    case 'get_workflow_status':
    case 'list_workflow_templates':
      return handleLegacyWorkflowTools(client, name, args);
    case 'get_content_analytics':
    case 'get_usage_stats':
      return handleLegacyAnalyticsTools(client, name, args);
    case 'generate_linkedin_content':
    case 'get_linkedin_connection_status':
    case 'get_linkedin_analytics':
      return handleLegacyLinkedInTools(client, name, args);
    default:
      // `executeTool` only routes `LEGACY_TOOL_NAMES` here, so this is
      // unreachable in practice; throw rather than silently returning
      // undefined if the two ever drift.
      throw new Error(`Unknown legacy tool: ${name}`);
  }
}

async function handleLegacyVideoTools(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'get_video_status': {
      if (!args?.videoId) {
        throw new Error('videoId required');
      }
      const status = await client.getVideoStatus(args.videoId as string);
      return {
        structuredContent: { data: { ...status, id: args.videoId } },
        content: [
          {
            text: `Video Status: ${status.status}\nProgress: ${status.progress}%\n${status.message || ''}${status.url ? `\nURL: ${status.url}` : ''}`,
            type: 'text' as const,
          },
        ],
      };
    }
    case 'list_videos': {
      const limit = (args?.limit as number) || 10;
      const offset = (args?.offset as number) || 0;
      const videos = await client.listVideos(limit, offset);
      return {
        structuredContent: { data: videos },
        content: [
          {
            text: formatListResult(videos, 'videos'),
            type: 'text' as const,
          },
        ],
      };
    }
    case 'get_video_analytics': {
      if (!args?.videoId) {
        throw new Error('videoId required');
      }
      const videoId = args.videoId as string;
      const timeRange = (args.timeRange as string) || '7d';
      const analytics = await client.getVideoAnalytics(videoId, timeRange);
      return {
        content: [
          {
            text: `Video Analytics (${timeRange}):\n\n${JSON.stringify(analytics, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown legacy video tool: ${name}`);
  }
}

async function handleLegacyArticleTools(
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
    default:
      throw new Error(`Unknown legacy article tool: ${name}`);
  }
}

async function handleLegacyLibraryTools(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'list_images': {
      const images = await client.listImages({
        limit: args?.limit as number | undefined,
        offset: args?.offset as number | undefined,
      });
      return {
        structuredContent: { data: images },
        content: [
          {
            text: formatListResult(images, 'images'),
            type: 'text' as const,
          },
        ],
      };
    }
    case 'list_avatars': {
      const avatars = await client.listAvatars({
        limit: args?.limit as number | undefined,
      });
      return {
        structuredContent: { data: avatars },
        content: [
          {
            text: formatListResult(avatars, 'avatars'),
            type: 'text' as const,
          },
        ],
      };
    }
    case 'list_music': {
      const musicTracks = await client.listMusic({
        limit: args?.limit as number | undefined,
      });
      return {
        structuredContent: { data: musicTracks },
        content: [
          {
            text: formatListResult(musicTracks, 'music tracks'),
            type: 'text' as const,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown legacy library tool: ${name}`);
  }
}

async function handleLegacyWorkflowTools(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'get_workflow_status': {
      if (!args?.workflowId) {
        throw new Error('workflowId required');
      }
      const workflow = await client.getWorkflowStatus(
        args.workflowId as string,
      );

      return {
        content: [
          {
            text: `Workflow Status: ${workflow.name}\n\nID: ${workflow.id}\nStatus: ${workflow.status}\nVersion: ${workflow.version ?? 'N/A'}\nNodes: ${workflow.nodeCount ?? 0}\nLast Run: ${workflow.lastRunAt || 'Never'}\nNext Run: ${workflow.nextRunAt || 'Not scheduled'}`,
            type: 'text' as const,
          },
        ],
      };
    }
    case 'list_workflow_templates': {
      const templates = await client.listWorkflowTemplates();

      return {
        content: [
          {
            text:
              templates.length > 0
                ? `Available Workflow Templates:\n\n${templates.map((t) => `- ${t.name} (${t.id})\n  ${t.description}\n  Category: ${t.category}${t.creditsRequired ? `\n  Credits: ${t.creditsRequired}` : ''}`).join('\n\n')}`
                : 'No workflow templates available.',
            type: 'text' as const,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown legacy workflow tool: ${name}`);
  }
}

async function handleLegacyAnalyticsTools(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'get_content_analytics': {
      if (!args?.contentId || !args.contentType) {
        throw new Error('contentId and contentType required');
      }

      const contentId = args.contentId as string;
      const contentType = args.contentType as string;

      if (contentType === 'video') {
        const analytics = await client.getVideoAnalytics(
          contentId,
          (args.timeRange as string) || '7d',
        );
        return {
          content: [
            {
              text: `Analytics for ${contentType} ${contentId}:\n\n${JSON.stringify(analytics, null, 2)}`,
              type: 'text' as const,
            },
          ],
        };
      }

      // Articles and images route through the canonical agent executor
      // (`get_analytics`), which already owns content→published-post
      // resolution, per-collection analytics rollups, and tenant scoping.
      // Reusing it keeps the MCP and agent surfaces on one implementation
      // rather than two that drift — this branch used to return a hardcoded
      // "data is being compiled" string for exactly these two types.
      const result = await client.executeAgentTool('get_analytics', {
        contentId,
      });

      if (!result.success) {
        throw new Error(
          result.error ||
            `Failed to get analytics for ${contentType} ${contentId}`,
        );
      }

      // `getPostAnalyticsSummary` and `getArticleAnalyticsSummary` both roll
      // up every recorded day, so this is a lifetime total; the declared
      // `timeRange` argument does not narrow it. Say so rather than stamping
      // a range the numbers do not honor.
      return {
        content: [
          {
            text: `Analytics for ${contentType} ${contentId} (lifetime totals):\n\n${JSON.stringify(result.data, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    }
    case 'get_usage_stats': {
      const stats = await client.getUsageStats(
        (args?.timeRange as string) || '30d',
      );
      return {
        structuredContent: { data: stats },
        content: [
          {
            text: `Usage Statistics (${stats.timeRange}):\n\nContent Created:\n- Videos: ${stats.contentCreated.videos}\n- Articles: ${stats.contentCreated.articles}\n- Images: ${stats.contentCreated.images}\n- Music: ${stats.contentCreated.music}\n- Avatars: ${stats.contentCreated.avatars}\n\nCredits Used: ${stats.creditsUsed}\nPosts Published: ${stats.postsPublished}\nTotal Engagement: ${stats.totalEngagement}`,
            type: 'text' as const,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown legacy analytics tool: ${name}`);
  }
}

async function handleLegacyLinkedInTools(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
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
    case 'get_linkedin_connection_status': {
      const connectionStatus = await client.getLinkedInConnectionStatus();
      return {
        content: [
          {
            text: JSON.stringify(connectionStatus, null, 2),
            type: 'text' as const,
          },
        ],
      };
    }
    case 'get_linkedin_analytics': {
      if (!args?.contentId) {
        throw new Error('contentId is required');
      }
      const linkedInAnalytics = await client.getLinkedInAnalytics(
        args.contentId as string,
        (args.timeRange as string) || '7d',
      );
      return {
        content: [
          {
            text: JSON.stringify(linkedInAnalytics, null, 2),
            type: 'text' as const,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown legacy LinkedIn tool: ${name}`);
  }
}
