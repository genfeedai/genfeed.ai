import type {
  ImageCreationParams,
  ImageResponse,
} from '@mcp/shared/interfaces/image.interface';
import type {
  MusicCreationParams,
  MusicResponse,
} from '@mcp/shared/interfaces/music.interface';
import type {
  VideoCreationParams,
  VideoResponse,
} from '@mcp/shared/interfaces/video.interface';
import type { BaseApiClient } from './base-api-client';
import { CONTENT_STATUS } from './client.types';

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Media generation: videos, images, and music. */
export class MediaClient {
  constructor(private readonly base: BaseApiClient) {}

  createVideo(params: VideoCreationParams): Promise<VideoResponse> {
    this.base.logger.debug('Creating video', { params });

    return this.base.request(
      'creating video',
      async (http) => {
        const response = await http.post('/videos', {
          data: {
            attributes: {
              duration: params.duration,
              height: 1080,
              model: 'google/veo-2',
              prompt: params.description,
              style: params.style,
              text: params.description,
              title: params.title,
              width: 1920,
              ...(params.voiceOver?.enabled && { voiceOver: params.voiceOver }),
            },
            type: 'videos',
          },
        });

        const video = response.data?.data;
        return {
          estimatedCompletion: new Date(
            Date.now() + 5 * 60 * 1000,
          ).toISOString(),
          id: video?.id || video?.attributes?.id,
          status: video?.attributes?.status || CONTENT_STATUS.PROCESSING,
          url: video?.attributes?.url,
        };
      },
      this.base.failWithDetail('Failed to create video'),
    );
  }

  createImage(params: ImageCreationParams): Promise<ImageResponse> {
    this.base.logger.debug('Creating image', { params });

    return this.base.request(
      'creating image',
      async (http) => {
        const response = await http.post('/images', {
          data: {
            attributes: {
              quality: params.quality || 'standard',
              size: params.size || 'square',
              style: params.style || 'realistic',
              text: params.prompt,
            },
            type: 'images',
          },
        });

        const image = response.data?.data;
        return {
          createdAt: image?.attributes?.createdAt || new Date().toISOString(),
          id: image?.id || image?.attributes?.id,
          prompt: params.prompt,
          size: params.size || 'square',
          status: image?.attributes?.status || CONTENT_STATUS.PROCESSING,
          style: params.style || 'realistic',
          url: image?.attributes?.url || '',
        };
      },
      this.base.failWithDetail('Failed to create image'),
    );
  }

  createMusic(params: MusicCreationParams): Promise<MusicResponse> {
    this.base.logger.debug('Creating music', { params });

    return this.base.request(
      'creating music',
      async (http) => {
        const response = await http.post('/musics', {
          data: {
            attributes: {
              duration: params.duration || 60,
              genre: params.genre,
              mood: params.mood,
              prompt: params.prompt,
            },
            type: 'musics',
          },
        });

        const music = response.data?.data;
        return {
          createdAt: music?.attributes?.createdAt || new Date().toISOString(),
          duration: params.duration || 60,
          genre: params.genre,
          id: music?.id || music?.attributes?.id,
          mood: params.mood,
          prompt: params.prompt,
          status: music?.attributes?.status || CONTENT_STATUS.PROCESSING,
          url: music?.attributes?.url,
        };
      },
      this.base.failWithDetail('Failed to create music'),
    );
  }
}
