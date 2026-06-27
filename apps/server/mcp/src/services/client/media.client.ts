import type {
  AvatarResource,
  ImageResource,
  MusicResource,
  VideoResource,
} from '@mcp/shared/interfaces/api-response.interface';
import type {
  AvatarCreationParams,
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
  VideoCreationParams,
  VideoResponse,
  VideoStatus,
} from '@mcp/shared/interfaces/video.interface';
import type { BaseApiClient } from './base-api-client';
import { CONTENT_STATUS } from './client.types';

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

  listVideos(limit: number = 10, offset: number = 0): Promise<VideoResponse[]> {
    this.base.logger.debug(`Listing videos: limit=${limit}, offset=${offset}`);

    return this.base.request(
      'listing videos',
      async (http) => {
        const response = await http.get('/videos', {
          params: { 'page[limit]': limit, 'page[offset]': offset },
        });

        return (
          response.data?.data?.map((video: VideoResource) => ({
            createdAt: video.attributes?.createdAt,
            duration: video.attributes?.duration,
            id: video.id,
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
              prompt: params.prompt,
              quality: params.quality || 'standard',
              size: params.size || 'square',
              style: params.style || 'realistic',
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
          },
        });

        return (
          response.data?.data?.map((image: ImageResource) => ({
            createdAt: image.attributes?.createdAt,
            id: image.id,
            prompt: image.attributes?.prompt || '',
            size: image.attributes?.size || 'square',
            status: image.attributes?.status || CONTENT_STATUS.COMPLETED,
            style: image.attributes?.style || 'realistic',
            url: image.attributes?.url || '',
          })) || []
        );
      },
      this.base.failWith('Failed to list images'),
    );
  }

  createAvatar(params: AvatarCreationParams): Promise<AvatarResponse> {
    this.base.logger.debug('Creating avatar', { params });

    return this.base.request(
      'creating avatar',
      async (http) => {
        const response = await http.post('/avatars/generate', {
          data: {
            attributes: {
              age: params.age || 'middle-aged',
              gender: params.gender,
              name: params.name,
              style: params.style || 'realistic',
            },
            type: 'avatars',
          },
        });

        const avatar = response.data?.data;
        return {
          age: params.age || 'middle-aged',
          createdAt: avatar?.attributes?.createdAt || new Date().toISOString(),
          gender: params.gender,
          id: avatar?.id || avatar?.attributes?.id,
          name: params.name,
          status: avatar?.attributes?.status || CONTENT_STATUS.PROCESSING,
          style: params.style || 'realistic',
          thumbnailUrl: avatar?.attributes?.thumbnailUrl,
          videoUrl: avatar?.attributes?.videoUrl,
        };
      },
      this.base.failWithDetail('Failed to create avatar'),
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
          },
        });

        return (
          response.data?.data?.map((avatar: AvatarResource) => ({
            age: avatar.attributes?.age,
            createdAt: avatar.attributes?.createdAt,
            gender: avatar.attributes?.gender,
            id: avatar.id,
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
          },
        });

        return (
          response.data?.data?.map((music: MusicResource) => ({
            createdAt: music.attributes?.createdAt,
            duration: music.attributes?.duration || 0,
            genre: music.attributes?.genre,
            id: music.id,
            mood: music.attributes?.mood,
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
