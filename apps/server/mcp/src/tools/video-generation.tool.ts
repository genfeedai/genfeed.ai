import type { ClientService } from '@mcp/services/client.service';

export interface VideoGenerationParams {
  prompt: string;
  model?: string;
  duration?: number;
  title?: string;
}

export function createVideoGenerationTool(client: ClientService) {
  return {
    description:
      'Generate an AI video using Genfeed. Supports text-to-video and image-to-video generation.',

    async handler(params: VideoGenerationParams) {
      const result = await client.createVideo({
        description: params.prompt,
        duration: params.duration,
        style: params.model || 'kling-2.1',
        title: params.title || params.prompt.slice(0, 60),
      });
      return {
        content: [
          {
            text: JSON.stringify(result, null, 2),
            type: 'text' as const,
          },
        ],
      };
    },
    inputSchema: {
      properties: {
        aspectRatio: {
          description: 'Aspect ratio (e.g., 16:9, 9:16, 1:1)',
          type: 'string',
        },
        brandId: {
          description: 'Brand ID for brand-specific generation',
          type: 'string',
        },
        duration: {
          description: 'Video duration in seconds',
          type: 'number',
        },
        imageUrl: {
          description: 'Source image URL for image-to-video generation',
          type: 'string',
        },
        model: {
          description: 'Model to use (e.g., kling-2.1, runway-gen3, wan-2.2)',
          type: 'string',
        },
        prompt: {
          description: 'Text prompt describing the video to generate',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object' as const,
    },
    name: 'generate_video',
  };
}
