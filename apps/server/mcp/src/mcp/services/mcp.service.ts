import type { McpConfiguration } from '@mcp/shared/interfaces/mcp-config.interface';
import { Injectable } from '@nestjs/common';

export interface McpExample {
  capabilities: {
    resources: { listChanged: boolean };
    tools: { listChanged: boolean };
  };
  description: string;
  installation: {
    configuration: {
      claudeDesktop: {
        example: McpConfiguration;
        path: string;
      };
    };
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
    return {
      mcpServers: {
        'genfeed-ai': {
          args: ['dist/mcp/main.js'],
          command: 'node',
          env: {
            GENFEED_API_KEY: 'your-api-key-here',
            GENFEEDAI_API_URL: 'https://api.genfeed.ai',
            MCP_PORT: '3003',
            NODE_ENV: 'production',
          },
        },
      },
    };
  }

  getMcpExample(): McpExample {
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
        configuration: {
          claudeDesktop: {
            example: {
              mcpServers: {
                'genfeed-ai': {
                  args: ['/path/to/genfeed/dist/mcp/main.js'],
                  command: 'node',
                  env: {
                    GENFEED_API_KEY: 'your-api-key-here',
                    GENFEEDAI_API_URL: 'https://api.genfeed.ai',
                    MCP_PORT: '3003',
                    NODE_ENV: 'production',
                  },
                },
              },
            },
            path: '~/.config/claude-desktop/config.json',
          },
        },
        description: 'Install Genfeed.ai MCP Server',
        steps: [
          '1. Clone the Genfeed.ai repository',
          '2. Install dependencies: npm install',
          '3. Set up environment variables',
          '4. Build the project: npm run build',
          '5. Add the MCP server configuration to your Claude Desktop settings',
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
