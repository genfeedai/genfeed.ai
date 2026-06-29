import { getPublicMcpUrl } from '@mcp/mcp/setup-page';
import type {
  McpClientExamples,
  McpConfiguration,
} from '@mcp/shared/interfaces/mcp-config.interface';
import { Injectable } from '@nestjs/common';

export interface McpExample {
  capabilities: {
    resources: { listChanged: boolean };
    tools: { listChanged: boolean };
  };
  description: string;
  installation: {
    clientExamples: McpClientExamples;
    description: string;
    steps: string[];
  };
  name: string;
  resources: Array<{
    description: string;
    mimeType: string;
    name: string;
    uri: string;
  }>;
  tools: Array<{
    description: string;
    inputSchema: {
      properties: Record<string, unknown>;
      required?: string[];
      type: string;
    };
    name: string;
  }>;
  version: string;
}

@Injectable()
export class MCPService {
  getHello(): string {
    return 'Genfeed.ai MCP Server - Ready to serve AI-powered video generation!';
  }

  getMcpConfiguration(): McpConfiguration {
    const mcpUrl = getPublicMcpUrl();

    return {
      mcpServers: {
        genfeed: {
          headers: {
            Authorization: 'Bearer ${GENFEED_API_KEY}',
          },
          transport: 'streamable-http',
          type: 'http',
          url: mcpUrl,
        },
      },
    };
  }

  getMcpExample(): McpExample {
    const mcpUrl = getPublicMcpUrl();

    return {
      capabilities: {
        resources: {
          listChanged: true,
        },
        tools: {
          listChanged: true,
        },
      },
      description: 'AI-powered video generation and analytics MCP server',
      installation: {
        clientExamples: {
          claudeCode: {
            command: `claude mcp add --transport http genfeed --scope user ${mcpUrl} --header "Authorization: Bearer $GENFEED_API_KEY"`,
          },
          codex: {
            command: `codex mcp add genfeed --url ${mcpUrl} --bearer-token-env-var GENFEED_API_KEY`,
            configToml: `[mcp_servers.genfeed]
url = "${mcpUrl}"
bearer_token_env_var = "GENFEED_API_KEY"`,
          },
          mcpServers: {
            genfeed: {
              env: {
                GENFEED_API_KEY: 'gf_live_xxx',
              },
              headers: {
                Authorization: 'Bearer ${GENFEED_API_KEY}',
              },
              transport: 'streamable-http',
              type: 'http',
              url: mcpUrl,
            },
          },
        },
        description: 'Connect the hosted Genfeed.ai MCP server',
        steps: [
          '1. Create a Genfeed API key in app settings',
          '2. Export GENFEED_API_KEY in your shell or client environment',
          '3. Add the hosted Streamable HTTP endpoint to Claude Code or Codex',
          '4. Verify the server with your client MCP list command',
        ],
      },
      name: 'Genfeed.ai MCP Server',
      resources: [
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
      ],
      tools: [
        {
          description: 'Create a new video with Genfeed AI',
          inputSchema: {
            properties: {
              description: {
                description: 'Description or script for the video',
                type: 'string',
              },
              duration: {
                description: 'Target duration in seconds',
                maximum: 120,
                minimum: 10,
                type: 'number',
              },
              style: {
                description: 'Visual style for the video',
                enum: [
                  'professional',
                  'casual',
                  'animated',
                  'documentary',
                  'tutorial',
                ],
                type: 'string',
              },
              title: {
                description: 'Title of the video',
                type: 'string',
              },
              voiceOver: {
                properties: {
                  enabled: {
                    description: 'Whether to include voice-over',
                    type: 'boolean',
                  },
                  voice: {
                    description: 'Voice type',
                    enum: ['male', 'female', 'neutral'],
                    type: 'string',
                  },
                },
                type: 'object',
              },
            },
            required: ['title', 'description'],
            type: 'object',
          },
          name: 'generate_video',
        },
        {
          description: 'Check the status of a video creation job',
          inputSchema: {
            properties: {
              videoId: {
                description: 'The ID of the video to check',
                type: 'string',
              },
            },
            required: ['videoId'],
            type: 'object',
          },
          name: 'get_video_status',
        },
        {
          description: 'List all videos in your organization',
          inputSchema: {
            properties: {
              limit: {
                default: 10,
                description: 'Maximum number of videos to return',
                type: 'number',
              },
              offset: {
                default: 0,
                description: 'Offset for pagination',
                type: 'number',
              },
            },
            type: 'object',
          },
          name: 'list_videos',
        },
        {
          description: 'Get detailed analytics for a specific video',
          inputSchema: {
            properties: {
              timeRange: {
                default: '7d',
                description: 'Time range for analytics',
                enum: ['24h', '7d', '30d', '90d', 'all'],
                type: 'string',
              },
              videoId: {
                description: 'The ID of the video',
                type: 'string',
              },
            },
            required: ['videoId'],
            type: 'object',
          },
          name: 'get_video_analytics',
        },
      ],
      version: '1.0.0',
    };
  }
}
