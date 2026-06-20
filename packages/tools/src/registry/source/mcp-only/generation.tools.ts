import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_GENERATION_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description: 'Check the status of a video creation job',
    name: 'get_video_status',
    parameters: {
      properties: {
        videoId: {
          description: 'The ID of the video to check',
          type: 'string',
        },
      },
      required: ['videoId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List all videos in your organization',
    name: 'list_videos',
    parameters: {
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
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List all generated images',
    name: 'list_images',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of images to return',
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
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Generate AI avatars for videos, perfect for talking head videos, presentations, and content creation.',
    name: 'create_avatar',
    parameters: {
      properties: {
        age: {
          default: 'middle-aged',
          description: 'Age range',
          enum: ['young', 'middle-aged', 'senior'],
          type: 'string',
        },
        gender: {
          description: 'Avatar gender',
          enum: ['male', 'female', 'neutral'],
          type: 'string',
        },
        name: {
          description: 'Name for the avatar',
          type: 'string',
        },
        style: {
          default: 'realistic',
          description: 'Avatar style',
          enum: ['realistic', 'cartoon', 'professional', 'casual'],
          type: 'string',
        },
      },
      required: ['name'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List all available avatars',
    name: 'list_avatars',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of avatars to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List all generated music tracks',
    name: 'list_music',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of tracks to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];
