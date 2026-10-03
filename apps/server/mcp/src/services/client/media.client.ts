import type { IngredientOrigin } from '@genfeedai/contracts';
import type {
  AvatarResource,
  ImageResource,
  MusicResource,
  VideoResource,
} from '@mcp/shared/interfaces/api-response.interface';
import type {
  AvatarListParams,
  AvatarResponse,
} from '@mcp/shared/interfaces/avatar.interface';
import type {
  ImageCreationParams,
  ImageListParams,
  ImageResponse,
} from '@mcp/shared/interfaces/image.interface';
import type {
  MusicCreationParams,
  MusicListParams,
  MusicResponse,
} from '@mcp/shared/interfaces/music.interface';
import type {
  MergeVideoResource,
  MergeVideosParams,
  MergeVideosResult,
  VideoCreationParams,
  VideoResponse,
  VideoStatus,
} from '@mcp/shared/interfaces/video.interface';
import type { BaseApiClient } from './base-api-client';
import { CONTENT_STATUS } from './client.types';

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Media generation + listing: videos, images, avatars, and music. */
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

  getVideoStatus(videoId: string): Promise<VideoStatus> {
    this.base.logger.debug(`Getting video status for ID: ${videoId}`);

    return this.base.request(
      'getting video status',
      async (http) => {
        const response = await http.get(`/videos/${videoId}`);
        const video = response.data?.data;

        return {
          message: video?.attributes?.message || '',
          progress: video?.attributes?.progress || 0,
          status: video?.attributes?.status || CONTENT_STATUS.UNKNOWN,
          url: video?.attributes?.url,
        };
      },
      this.base.failWith('Failed to get video status'),
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

  listVideos(
    limit: number = 10,
    offset: number = 0,
    origin?: IngredientOrigin,
    characterIds?: string[],
  ): Promise<VideoResponse[]> {
    this.base.logger.debug(
      `Listing videos: limit=${limit}, offset=${offset}, origin=${origin ?? 'any'}, characters=${characterIds?.length ?? 0}`,
    );

    return this.base.request(
      'listing videos',
      async (http) => {
        const response = await http.get('/videos', {
          params: {
            'page[limit]': limit,
            'page[offset]': offset,
            ...(origin ? { origins: origin } : {}),
            ...(characterIds?.length ? { characters: characterIds } : {}),
          },
        });

        return (
          response.data?.data?.map((video: VideoResource) => ({
            createdAt: video.attributes?.createdAt,
            duration: video.attributes?.duration,
            id: video.id,
            origin: video.attributes?.origin,
            status: video.attributes?.status || CONTENT_STATUS.UNKNOWN,
            title: video.attributes?.title || 'Untitled',
            url: video.attributes?.url,
            views: video.attributes?.views || 0,
          })) || []
        );
      },
      this.base.failWith('Failed to list videos'),
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

  listImages(params: ImageListParams = {}): Promise<ImageResponse[]> {
    this.base.logger.debug('Listing images', { params });

    return this.base.request(
      'listing images',
      async (http) => {
        const response = await http.get('/images', {
          params: {
            'page[limit]': params.limit || 10,
            'page[offset]': params.offset || 0,
            ...(params.origin ? { origins: params.origin } : {}),
            ...(params.characterIds?.length
              ? { characters: params.characterIds }
              : {}),
          },
        });

        return (
          response.data?.data?.map((image: ImageResource) => {
            const attributes = image.attributes as
              | (ImageResource['attributes'] & {
                  cdnUrl?: string;
                  text?: string;
                })
              | undefined;
            const prompt =
              readNonEmptyString(attributes?.prompt) ||
              readNonEmptyString(attributes?.text) ||
              '';
            const url =
              readNonEmptyString(attributes?.url) ||
              readNonEmptyString(attributes?.cdnUrl) ||
              '';
            return {
              createdAt: attributes?.createdAt,
              id: image.id,
              origin: attributes?.origin,
              prompt,
              size: attributes?.size || 'square',
              status: attributes?.status || CONTENT_STATUS.COMPLETED,
              style: attributes?.style || 'realistic',
              url,
            };
          }) || []
        );
      },
      this.base.failWith('Failed to list images'),
    );
  }

  listAvatars(params: AvatarListParams = {}): Promise<AvatarResponse[]> {
    this.base.logger.debug('Listing avatars', { params });

    return this.base.request(
      'listing avatars',
      async (http) => {
        const response = await http.get('/avatars', {
          params: {
            'page[limit]': params.limit || 10,
            'page[offset]': params.offset || 0,
            ...(params.origin ? { origins: params.origin } : {}),
          },
        });

        return (
          response.data?.data?.map((avatar: AvatarResource) => ({
            age: avatar.attributes?.age,
            createdAt: avatar.attributes?.createdAt,
            gender: avatar.attributes?.gender,
            id: avatar.id,
            origin: avatar.attributes?.origin,
            name: avatar.attributes?.name || 'Unnamed',
            status: avatar.attributes?.status || CONTENT_STATUS.COMPLETED,
            style: avatar.attributes?.style,
            thumbnailUrl: avatar.attributes?.thumbnailUrl,
            videoUrl: avatar.attributes?.videoUrl,
          })) || []
        );
      },
      this.base.failWith('Failed to list avatars'),
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

  listMusic(params: MusicListParams = {}): Promise<MusicResponse[]> {
    this.base.logger.debug('Listing music', { params });

    return this.base.request(
      'listing music',
      async (http) => {
        const response = await http.get('/musics', {
          params: {
            'page[limit]': params.limit || 10,
            'page[offset]': params.offset || 0,
            ...(params.origin ? { origins: params.origin } : {}),
          },
        });

        return (
          response.data?.data?.map((music: MusicResource) => ({
            createdAt: music.attributes?.createdAt,
            duration: music.attributes?.duration || 0,
            genre: music.attributes?.genre,
            id: music.id,
            mood: music.attributes?.mood,
            origin: music.attributes?.origin,
            prompt: music.attributes?.prompt || '',
            status: music.attributes?.status || CONTENT_STATUS.COMPLETED,
            url: music.attributes?.url,
          })) || []
        );
      },
      this.base.failWith('Failed to list music'),
    );
  }
}
