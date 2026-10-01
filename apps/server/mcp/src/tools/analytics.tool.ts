import type { ClientService } from '@mcp/services/client.service';

export const ANALYTICS_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'get_video_analytics',
  'get_content_analytics',
  'get_usage_stats',
  'get_linkedin_connection_status',
  'get_linkedin_analytics',
]);

export async function handleAnalyticsTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
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
      const result = await client.executeAgentTool('get_analytics', {
        contentId,
      });

      if (!result.success) {
        throw new Error(
          result.error ||
            `Failed to get analytics for ${contentType} ${contentId}`,
        );
      }

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
      throw new Error(`Unknown analytics tool: ${name}`);
  }
}
