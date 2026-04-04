import type { ClientService } from '@mcp/services/client.service';
import type { ImageCreationParams } from '@mcp/shared/interfaces/image.interface';

export interface ImageGenerationParams {
  prompt: string;
  style?: string;
}

function toImageStyle(value?: string): ImageCreationParams['style'] {
  if (
    value &&
    [
      'realistic',
      'artistic',
      'abstract',
      'cartoon',
      'photographic',
      'digital-art',
    ].includes(value)
  ) {
    return value as ImageCreationParams['style'];
  }
  return undefined;
}

export function createImageGenerationTool(client: ClientService) {
  return {
    description:
      'Generate an AI image using Genfeed. Supports multiple models including Flux, DALL-E, and Imagen.',

    async handler(params: ImageGenerationParams) {
      const result = await client.createImage({
        prompt: params.prompt,
        style: toImageStyle(params.style),
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
          description: 'Aspect ratio (e.g., 1:1, 16:9, 9:16)',
          type: 'string',
        },
        brandId: {
          description: 'Brand ID for brand-specific generation',
          type: 'string',
        },
        model: {
          description: 'Model to use (e.g., flux-dev, dall-e-3, imagen-3)',
          type: 'string',
        },
        prompt: {
          description: 'Text prompt describing the image to generate',
          type: 'string',
        },
        style: {
          description:
            'Style preset (e.g., photorealistic, anime, illustration)',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object' as const,
    },
    name: 'generate_image',
  };
}
