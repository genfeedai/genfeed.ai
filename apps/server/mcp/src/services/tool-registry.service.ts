import { getToolsForSurface, toMcpTools } from '@genfeedai/tools';
import { LoggerService } from '@libs/logger/logger.service';
import { McpAuthGuard } from '@mcp/guards/mcp-auth.guard';
import { ClientService } from '@mcp/services/client.service';
import type { ImageCreationParams } from '@mcp/shared/interfaces/image.interface';
import type {
  McpResource,
  McpTool,
} from '@mcp/shared/interfaces/mcp-server.interface';
import type { MusicCreationParams } from '@mcp/shared/interfaces/music.interface';
import type {
  PostListParams,
  SocialPlatform,
  TrendingTopicsParams,
} from '@mcp/shared/interfaces/post.interface';
import type {
  WorkflowCreateParams,
  WorkflowListParams,
} from '@mcp/shared/interfaces/workflow.interface';
import { handleAccountManagementTool } from '@mcp/tools/account-management.tool';
import { handleAdInsightsTool } from '@mcp/tools/ad-insights.tool';
import { handleAdminInfrastructureTool } from '@mcp/tools/admin-infrastructure.tool';
import { handleAgentChatTool } from '@mcp/tools/agent-chat.tool';
import { handleDarkroomGenerationTool } from '@mcp/tools/darkroom-generation.tool';
import { handleGoogleAdsTool } from '@mcp/tools/google-ads.tool';
import { handleMetaAdsTool } from '@mcp/tools/meta-ads.tool';
import { handleTrainingPipelineTool } from '@mcp/tools/training-pipeline.tool';
import { Injectable } from '@nestjs/common';

interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

interface ResourceReadParams {
  uri: string;
}

@Injectable()
export class ToolRegistryService {
  constructor(
    private readonly clientService: ClientService,
    private readonly logger: LoggerService,
  ) {}

  getTools(): McpTool[] {
    return toMcpTools(getToolsForSurface('mcp')) as McpTool[];
  }

  getResources(): McpResource[] {
    return [
      {
        description: 'Get analytics for all videos in your organization',
        mimeType: 'application/json',
        name: 'Video Analytics',
        uri: 'genfeed://analytics/videos',
      },
      {
        description: 'Get overall organization analytics',
        mimeType: 'application/json',
        name: 'Organization Analytics',
        uri: 'genfeed://analytics/organization',
      },
    ];
  }

  async handleToolCall(params: ToolCallParams) {
    const { name, arguments: args } = params;

    this.logger.debug(`Handling tool call: ${name}`, args);

    try {
      const canonicalTool = this.getTools().find((tool) => tool.name === name);
      if (!canonicalTool) {
        throw new Error(`Unknown tool: ${name}`);
      }
      switch (name) {
        case 'generate_video': {
          if (!args) {
            throw new Error('Arguments required for generate_video');
          }
          const video = await this.clientService.createVideo({
            description: args.description as string,
            duration: args.duration as number | undefined,
            style: args.style as string | undefined,
            title: args.title as string,
            voiceOver: args.voiceOver as
              | { enabled: boolean; voice?: string }
              | undefined,
          });

          return {
            component: {
              allowFullscreen: true,
              height: 500,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/video-player?id=${video.id}`,
            },
            content: [
              {
                text: `Video "${args.title}" created successfully!\n\nVideo ID: ${video.id}\nStatus: ${video.status}\nEstimated completion: ${video.estimatedCompletion}`,
                type: 'text',
              },
            ],
          };
        }

        case 'get_video_status': {
          if (!args || !args.videoId) {
            throw new Error('videoId required');
          }
          const status = await this.clientService.getVideoStatus(
            args.videoId as string,
          );
          return {
            content: [
              {
                text: `Video Status: ${status.status}\nProgress: ${status.progress}%\n${status.message || ''}${status.url ? `\nURL: ${status.url}` : ''}`,
                type: 'text',
              },
            ],
          };
        }

        case 'list_videos': {
          const limit = (args?.limit as number) || 10;
          const offset = (args?.offset as number) || 0;
          const videos = await this.clientService.listVideos(limit, offset);
          return {
            content: [
              {
                text:
                  videos.length > 0
                    ? `Found ${videos.length} videos:\n\n${JSON.stringify(videos, null, 2)}`
                    : 'No videos found.',
                type: 'text',
              },
            ],
          };
        }

        case 'get_video_analytics': {
          if (!args || !args.videoId) {
            throw new Error('videoId required');
          }
          const videoId = args.videoId as string;
          const timeRange = (args.timeRange as string) || '7d';
          const analytics = await this.clientService.getVideoAnalytics(
            videoId,
            timeRange,
          );
          return {
            content: [
              {
                text: `Video Analytics (${timeRange}):\n\n${JSON.stringify(analytics, null, 2)}`,
                type: 'text',
              },
            ],
          };
        }

        case 'create_article': {
          if (!args || !args.topic) {
            throw new Error('topic required');
          }
          const article = await this.clientService.createArticle({
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
            component: {
              height: 600,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/article-preview?id=${article.id}`,
            },
            content: [
              {
                text: `Article created successfully!\n\nArticle ID: ${article.id}\nTitle: ${article.title}\nStatus: ${article.status}\nWord Count: ${article.wordCount}`,
                type: 'text',
              },
            ],
          };
        }

        case 'search_articles': {
          if (!args || !args.query) {
            throw new Error('query required');
          }
          const articles = await this.clientService.searchArticles({
            category: args.category as string | undefined,
            limit: args.limit as number | undefined,
            query: args.query as string,
          });

          return {
            component: {
              height: 500,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/article-list?q=${encodeURIComponent(args.query as string)}`,
            },
            content: [
              {
                text:
                  articles.length > 0
                    ? `Found ${articles.length} articles matching "${args.query}":\n\n${JSON.stringify(articles, null, 2)}`
                    : `No articles found matching "${args.query}".`,
                type: 'text',
              },
            ],
          };
        }

        case 'get_article': {
          if (!args || !args.articleId) {
            throw new Error('articleId required');
          }
          const article = await this.clientService.getArticle(
            args.articleId as string,
          );
          return {
            component: {
              height: 600,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/article-preview?id=${args.articleId}`,
            },
            content: [
              {
                text: `Article: ${article.title}\n\nID: ${article.id}\nStatus: ${article.status}\nWord Count: ${article.wordCount}\nCreated: ${article.createdAt}\n\nContent Preview:\n${article.content?.substring(0, 500)}...`,
                type: 'text',
              },
            ],
          };
        }

        case 'generate_image': {
          if (!args || !args.prompt) {
            throw new Error('prompt required');
          }
          const image = await this.clientService.createImage({
            prompt: args.prompt as string,
            quality: args.quality as 'standard' | 'hd' | undefined,
            size: args.size as ImageCreationParams['size'],
            style: args.style as ImageCreationParams['style'],
          });

          return {
            component: {
              height: 600,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/image-gallery?id=${image.id}`,
            },
            content: [
              {
                text: `Image generated successfully!\n\nImage ID: ${image.id}\nPrompt: "${args.prompt}"\nStyle: ${image.style}\nSize: ${image.size}\nStatus: ${image.status}${image.url ? `\nURL: ${image.url}` : ''}`,
                type: 'text',
              },
            ],
          };
        }

        case 'list_images': {
          const images = await this.clientService.listImages({
            limit: args?.limit as number | undefined,
            offset: args?.offset as number | undefined,
          });
          return {
            component: {
              height: 600,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/image-gallery`,
            },
            content: [
              {
                text:
                  images.length > 0
                    ? `Found ${images.length} images:\n\n${JSON.stringify(images, null, 2)}`
                    : 'No images found.',
                type: 'text',
              },
            ],
          };
        }

        case 'create_avatar': {
          if (!args || !args.name) {
            throw new Error('name required');
          }
          const avatar = await this.clientService.createAvatar({
            age: args.age as 'young' | 'middle-aged' | 'senior' | undefined,
            gender: args.gender as 'male' | 'female' | 'neutral' | undefined,
            name: args.name as string,
            style: args.style as
              | 'realistic'
              | 'cartoon'
              | 'professional'
              | 'casual'
              | undefined,
          });

          return {
            component: {
              height: 500,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/avatar-preview?id=${avatar.id}`,
            },
            content: [
              {
                text: `Avatar "${args.name}" created successfully!\n\nAvatar ID: ${avatar.id}\nStyle: ${avatar.style}\nGender: ${avatar.gender || 'not specified'}\nAge: ${avatar.age}\nStatus: ${avatar.status}`,
                type: 'text',
              },
            ],
          };
        }

        case 'list_avatars': {
          const avatars = await this.clientService.listAvatars({
            limit: args?.limit as number | undefined,
          });
          return {
            content: [
              {
                text:
                  avatars.length > 0
                    ? `Found ${avatars.length} avatars:\n\n${JSON.stringify(avatars, null, 2)}`
                    : 'No avatars found.',
                type: 'text',
              },
            ],
          };
        }

        case 'generate_music': {
          if (!args || !args.prompt) {
            throw new Error('prompt required');
          }
          const music = await this.clientService.createMusic({
            duration: args.duration as number | undefined,
            genre: args.genre as MusicCreationParams['genre'],
            mood: args.mood as MusicCreationParams['mood'],
            prompt: args.prompt as string,
          });

          return {
            component: {
              height: 400,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/music-player?id=${music.id}`,
            },
            content: [
              {
                text: `Music track created successfully!\n\nMusic ID: ${music.id}\nPrompt: "${args.prompt}"\nGenre: ${music.genre || 'auto'}\nMood: ${music.mood || 'auto'}\nDuration: ${music.duration}s\nStatus: ${music.status}`,
                type: 'text',
              },
            ],
          };
        }

        case 'list_music': {
          const musicTracks = await this.clientService.listMusic({
            limit: args?.limit as number | undefined,
          });
          return {
            content: [
              {
                text:
                  musicTracks.length > 0
                    ? `Found ${musicTracks.length} music tracks:\n\n${JSON.stringify(musicTracks, null, 2)}`
                    : 'No music tracks found.',
                type: 'text',
              },
            ],
          };
        }

        case 'create_post': {
          if (!args || !args.contentId || !args.platforms) {
            throw new Error('contentId and platforms required');
          }
          const platforms = args.platforms as SocialPlatform[];
          const posts = await this.clientService.publishContent({
            contentId: args.contentId as string,
            customMessage: args.customMessage as string | undefined,
            platforms,
            scheduleAt: args.scheduleAt as string | undefined,
          });

          const platformList = platforms.join(', ');
          const scheduledMsg = args.scheduleAt
            ? ` (scheduled for ${args.scheduleAt})`
            : '';

          return {
            component: {
              height: 500,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/publishing-dashboard`,
            },
            content: [
              {
                text: `Content published to ${platformList}${scheduledMsg}!\n\n${JSON.stringify(posts, null, 2)}`,
                type: 'text',
              },
            ],
          };
        }

        case 'list_posts': {
          const posts = await this.clientService.listPosts({
            limit: args?.limit as number | undefined,
            platform: args?.platform as PostListParams['platform'],
          });
          return {
            component: {
              height: 600,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/publishing-dashboard`,
            },
            content: [
              {
                text:
                  posts.length > 0
                    ? `Found ${posts.length} posts:\n\n${JSON.stringify(posts, null, 2)}`
                    : 'No posts found.',
                type: 'text',
              },
            ],
          };
        }

        case 'get_trends': {
          const trends = await this.clientService.getTrendingTopics({
            category: args?.category as TrendingTopicsParams['category'],
            timeframe: args?.timeframe as TrendingTopicsParams['timeframe'],
          });
          return {
            component: {
              height: 600,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/trending-topics?category=${args?.category || 'all'}&timeframe=${args?.timeframe || '24h'}`,
            },
            content: [
              {
                text:
                  trends.length > 0
                    ? `Trending topics in ${args?.category || 'all'} (${args?.timeframe || '24h'}):\n\n${JSON.stringify(trends, null, 2)}`
                    : 'No trending topics found.',
                type: 'text',
              },
            ],
          };
        }

        case 'get_content_analytics': {
          if (!args || !args.contentId || !args.contentType) {
            throw new Error('contentId and contentType required');
          }

          if (args.contentType === 'video') {
            const analytics = await this.clientService.getVideoAnalytics(
              args.contentId as string,
              (args.timeRange as string) || '7d',
            );
            return {
              content: [
                {
                  text: `Analytics for ${args.contentType} ${args.contentId}:\n\n${JSON.stringify(analytics, null, 2)}`,
                  type: 'text',
                },
              ],
            };
          }

          return {
            content: [
              {
                text: `Analytics for ${args.contentType} ${args.contentId} (${args.timeRange || '7d'}):\n\nAnalytics data is being compiled. Please check the dashboard for detailed metrics.`,
                type: 'text',
              },
            ],
          };
        }

        case 'get_credits_balance': {
          const credits = await this.clientService.getCredits();
          return {
            component: {
              height: 450,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/credits-dashboard`,
            },
            content: [
              {
                text: `Credits Summary:\n\nAvailable: ${credits.available}\nUsed: ${credits.used}\nTotal: ${credits.total}\n\nBreakdown:\n- Videos: ${credits.breakdown.videos}\n- Articles: ${credits.breakdown.articles}\n- Images: ${credits.breakdown.images}\n- Music: ${credits.breakdown.music}\n- Avatars: ${credits.breakdown.avatars}${credits.resetDate ? `\n\nResets: ${credits.resetDate}` : ''}`,
                type: 'text',
              },
            ],
          };
        }

        case 'get_usage_stats': {
          const stats = await this.clientService.getUsageStats(
            (args?.timeRange as string) || '30d',
          );
          return {
            component: {
              height: 500,
              type: 'iframe',
              url: `https://chatgpt.genfeed.ai/usage-stats?range=${args?.timeRange || '30d'}`,
            },
            content: [
              {
                text: `Usage Statistics (${stats.timeRange}):\n\nContent Created:\n- Videos: ${stats.contentCreated.videos}\n- Articles: ${stats.contentCreated.articles}\n- Images: ${stats.contentCreated.images}\n- Music: ${stats.contentCreated.music}\n- Avatars: ${stats.contentCreated.avatars}\n\nCredits Used: ${stats.creditsUsed}\nPosts Published: ${stats.postsPublished}\nTotal Engagement: ${stats.totalEngagement}`,
                type: 'text',
              },
            ],
          };
        }

        case 'create_workflow': {
          if (!args || !args.name) {
            throw new Error('name required');
          }
          const scheduleArg = args.schedule as
            | WorkflowCreateParams['schedule']
            | undefined;
          const schedule =
            scheduleArg?.type &&
            ['once', 'daily', 'weekly', 'monthly'].includes(scheduleArg.type)
              ? {
                  startAt: scheduleArg.startAt,
                  timezone: scheduleArg.timezone,
                  type: scheduleArg.type,
                }
              : undefined;
          const workflow = await this.clientService.createWorkflow({
            description: args.description as string | undefined,
            name: args.name as string,
            schedule,
            templateId: args.templateId as string | undefined,
          });

          return {
            content: [
              {
                text: `Workflow "${workflow.name}" created successfully!\n\nWorkflow ID: ${workflow.id}\nStatus: ${workflow.status}\nDescription: ${workflow.description || 'No description'}\nSteps: ${workflow.steps.length}${workflow.nextRunAt ? `\nNext Run: ${workflow.nextRunAt}` : ''}`,
                type: 'text',
              },
            ],
          };
        }

        case 'execute_workflow': {
          if (!args || !args.workflowId) {
            throw new Error('workflowId required');
          }
          const execution = await this.clientService.executeWorkflow({
            variables: args.variables as Record<string, unknown> | undefined,
            workflowId: args.workflowId as string,
          });

          return {
            content: [
              {
                text: `Workflow execution started!\n\nExecution ID: ${execution.executionId}\nWorkflow ID: ${execution.workflowId}\nStatus: ${execution.status}\nStarted: ${execution.startedAt}`,
                type: 'text',
              },
            ],
          };
        }

        case 'get_workflow_status': {
          if (!args || !args.workflowId) {
            throw new Error('workflowId required');
          }
          const workflow = await this.clientService.getWorkflowStatus(
            args.workflowId as string,
          );

          return {
            content: [
              {
                text: `Workflow Status: ${workflow.name}\n\nID: ${workflow.id}\nStatus: ${workflow.status}\nCurrent Step: ${workflow.currentStepIndex !== undefined ? workflow.currentStepIndex + 1 : 'N/A'} of ${workflow.steps.length}\nLast Run: ${workflow.lastRunAt || 'Never'}\nNext Run: ${workflow.nextRunAt || 'Not scheduled'}`,
                type: 'text',
              },
            ],
          };
        }

        case 'list_workflows': {
          const workflows = await this.clientService.listWorkflows({
            limit: args?.limit as number | undefined,
            status: args?.status as WorkflowListParams['status'],
          });

          return {
            content: [
              {
                text:
                  workflows.length > 0
                    ? `Found ${workflows.length} workflows:\n\n${workflows.map((w) => `- ${w.name} (${w.id}): ${w.status}`).join('\n')}\n\nFull details:\n${JSON.stringify(workflows, null, 2)}`
                    : 'No workflows found.',
                type: 'text',
              },
            ],
          };
        }

        case 'list_workflow_templates': {
          const templates = await this.clientService.listWorkflowTemplates();

          return {
            content: [
              {
                text:
                  templates.length > 0
                    ? `Available Workflow Templates:\n\n${templates.map((t) => `- ${t.name} (${t.id})\n  ${t.description}\n  Category: ${t.category}${t.creditsRequired ? `\n  Credits: ${t.creditsRequired}` : ''}`).join('\n\n')}`
                    : 'No workflow templates available.',
                type: 'text',
              },
            ],
          };
        }

        default: {
          // Route to external tool handlers
          // Check role access
          if (canonicalTool.requiredRole) {
            const request = (
              this.clientService as unknown as {
                currentRequest?: { authContext?: { role?: string } };
              }
            ).currentRequest;
            const userRole = request?.authContext?.role || 'user';
            McpAuthGuard.checkToolRole(
              userRole as 'user' | 'admin' | 'superadmin',
              canonicalTool.requiredRole,
            );
          }

          // Meta Ads tools
          if (
            name.startsWith('list_meta_') ||
            name.startsWith('get_meta_') ||
            name.startsWith('compare_meta_')
          ) {
            return handleMetaAdsTool(this.clientService, name, args || {});
          }

          // Google Ads tools
          if (
            name.startsWith('list_google_ads_') ||
            name.startsWith('get_google_ads_')
          ) {
            return handleGoogleAdsTool(this.clientService, name, args || {});
          }

          // Account management tools
          if (
            [
              'get_account_info',
              'list_brands',
              'get_brand',
              'get_job_status',
            ].includes(name)
          ) {
            return handleAccountManagementTool(
              this.clientService,
              name,
              args || {},
            );
          }

          // Admin infrastructure tools
          if (
            [
              'get_darkroom_health',
              'control_comfyui',
              'list_loras',
              'list_gpu_personas',
            ].includes(name)
          ) {
            return handleAdminInfrastructureTool(
              this.clientService,
              name,
              args || {},
            );
          }

          // Training pipeline tools
          if (
            [
              'start_training',
              'get_training_status',
              'get_dataset_info',
              'delete_dataset',
              'run_captioning',
            ].includes(name)
          ) {
            return handleTrainingPipelineTool(
              this.clientService,
              name,
              args || {},
            );
          }

          // Darkroom generation tools
          if (
            name.startsWith('generate_face_test') ||
            name.startsWith('generate_bootstrap') ||
            name.startsWith('generate_pulid') ||
            name.startsWith('generate_darkroom_') ||
            name === 'get_darkroom_job_status'
          ) {
            return handleDarkroomGenerationTool(
              this.clientService,
              name,
              args || {},
            );
          }

          // Agent chat tools
          if (['create_chat', 'send_chat_message'].includes(name)) {
            return handleAgentChatTool(this.clientService, name, args || {});
          }

          // Ad insights tools
          if (
            [
              'get_ad_performance_insights',
              'generate_ad_variations',
              'suggest_ad_headlines',
              'benchmark_ad_performance',
            ].includes(name)
          ) {
            return handleAdInsightsTool(this.clientService, name, args || {});
          }

          throw new Error(`Unknown tool: ${name}`);
        }
      }
    } catch (error: unknown) {
      this.logger.error(`Error handling tool call ${name}:`, error);
      return {
        content: [
          {
            text: `Error: ${(error as Error)?.message ?? String(error)}`,
            type: 'text',
          },
        ],
        isError: true,
      };
    }
  }

  async handleResourceRead(params: ResourceReadParams) {
    const { uri } = params;

    this.logger.debug(`Reading resource: ${uri}`);

    try {
      switch (uri) {
        case 'genfeed://analytics/videos': {
          const videoAnalytics = await this.clientService.getVideoAnalytics();
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify(videoAnalytics, null, 2),
                uri,
              },
            ],
          };
        }

        case 'genfeed://analytics/organization': {
          const orgAnalytics =
            await this.clientService.getOrganizationAnalytics();
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify(orgAnalytics, null, 2),
                uri,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    } catch (error: unknown) {
      this.logger.error(`Error reading resource ${uri}:`, error);
      throw error;
    }
  }

  setBearerToken(token: string) {
    this.clientService.setBearerToken(token);
  }
}
