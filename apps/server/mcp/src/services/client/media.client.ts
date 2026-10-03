import type {
  ImageCreationParams,
  ImageResponse,
} from '@mcp/shared/interfaces/image.interface';
import type {
  MusicCreationParams,
  MusicResponse,
} from '@mcp/shared/interfaces/music.interface';
import type {
  MergeVideoResource,
  MergeVideosParams,
  MergeVideosResult,
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

  mergeVideos(params: MergeVideosParams): Promise<MergeVideosResult> {
    this.base.logger.debug('Merging videos', { clipCount: params.ids.length });

    const body: Record<string, unknown> = {
      category: 'VIDEO',
      ids: params.ids,
    };
    if (params.isCaptionsEnabled !== undefined) {
      body.isCaptionsEnabled = params.isCaptionsEnabled;
    }
    if (params.isMuteVideoAudio !== undefined) {
      body.isMuteVideoAudio = params.isMuteVideoAudio;
    }
    if (params.isResizeEnabled !== undefined) {
      body.isResizeEnabled = params.isResizeEnabled;
    }
    if (params.music !== undefined) body.music = params.music;
    if (params.musicVolume !== undefined) body.musicVolume = params.musicVolume;
    if (params.transition !== undefined) body.transition = params.transition;
    if (params.transitionDuration !== undefined) {
      body.transitionDuration = params.transitionDuration;
    }
    if (params.transitionEaseCurve !== undefined) {
      body.transitionEaseCurve = params.transitionEaseCurve;
    }

    return this.base.request(
      'merging videos',
      async (http) => {
        const response = await http.post('/videos/merge', body);
        const video = (response.data?.data ?? response.data) as
          | MergeVideoResource
          | undefined;
        const id = readNonEmptyString(video?.id);
        if (!id) {
          throw new Error('Video merge did not return an output id');
        }
        const attributeStatus = video?.attributes?.status;
        return {
          id,
          status:
            typeof attributeStatus === 'string'
              ? attributeStatus
              : typeof video?.status === 'string'
                ? video.status
                : 'PROCESSING',
        };
      },
      this.base.failWithDetail('Failed to merge videos'),
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
