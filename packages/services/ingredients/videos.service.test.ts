import { Caption } from '@genfeedai/models/content/caption.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { VideosService } from '@services/ingredients/videos.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VideosService', () => {
  const token = 'videos-token';
  let service: VideosService;
  let http: MockHttpInstance;

  function mockVideoResponse(id = 'video_1'): void {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Video' }, { id })),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VideosService(token);
    http = installMockHttp(service);
  });

  it('getInstance caches one instance per token', () => {
    const first = VideosService.getInstance(token);
    expect(VideosService.getInstance(token)).toBe(first);
    expect(VideosService.getInstance('other-token')).not.toBe(first);
  });

  it('post serializes the body and forwards the abort signal', async () => {
    mockVideoResponse();
    const controller = new AbortController();

    const result = await service.post({ label: 'Video' }, controller.signal);

    expect(http.post).toHaveBeenCalledWith(
      '',
      { label: 'Video' },
      { signal: controller.signal },
    );
    expect(result.id).toBe('video_1');
  });

  it('findVideoAllPosts GETs the posts for a video', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'post_1', label: 'Post' }])),
    );

    const result = await service.findVideoAllPosts('video_1');

    expect(http.get).toHaveBeenCalledWith('/video_1/posts');
    expect(result[0]).toMatchObject({ id: 'post_1' });
  });

  describe('generation endpoints', () => {
    it('postLipSync POSTs the serialized payload', async () => {
      mockVideoResponse();

      await service.postLipSync({ audioUrl: 'https://a.mp3' });

      expect(http.post).toHaveBeenCalledWith('/lip-sync', {
        audioUrl: 'https://a.mp3',
      });
    });

    it('postMerge POSTs the serialized merge params', async () => {
      mockVideoResponse();

      await service.postMerge({ ids: ['v1', 'v2'] });

      expect(http.post).toHaveBeenCalledWith('/merge', { ids: ['v1', 'v2'] });
    });

    it('postUpscale POSTs serialized edit params to the id route', async () => {
      mockVideoResponse();

      await service.postUpscale('video_1', { scale: 2 });

      expect(http.post).toHaveBeenCalledWith('/video_1/upscale', { scale: 2 });
    });

    it('postResize POSTs resize params', async () => {
      mockVideoResponse();

      await service.postResize('video_1', { format: 'portrait' });

      expect(http.post).toHaveBeenCalledWith('/video_1/resize', {
        format: 'portrait',
      });
    });

    it('postReframe POSTs serialized edit params', async () => {
      mockVideoResponse();

      await service.postReframe('video_1', { prompt: 'wide' });

      expect(http.post).toHaveBeenCalledWith('/video_1/reframe', {
        prompt: 'wide',
      });
    });

    it.each([
      ['postReverse', '/video_1/reverse'],
      ['postPortrait', '/video_1/portrait'],
      ['postMirror', '/video_1/mirror'],
      ['postGif', '/video_1/gif'],
    ] as const)('%s POSTs to %s', async (method, path) => {
      mockVideoResponse();

      const result = await service[method]('video_1');

      expect(http.post).toHaveBeenCalledWith(path);
      expect(result.id).toBe('video_1');
    });

    it('postTrim POSTs start and end times', async () => {
      mockVideoResponse();

      await service.postTrim('video_1', 1.5, 9.25);

      expect(http.post).toHaveBeenCalledWith('/video_1/trim', {
        endTime: 9.25,
        startTime: 1.5,
      });
    });

    it('postTextOverlay POSTs the overlay params', async () => {
      mockVideoResponse();

      await service.postTextOverlay('video_1', { text: 'Hello' });

      expect(http.post).toHaveBeenCalledWith('/video_1/text-overlay', {
        text: 'Hello',
      });
    });

    it('createAvatarVideo POSTs the serialized avatar payload', async () => {
      mockVideoResponse('avatar_video');

      const result = await service.createAvatarVideo({
        avatarId: 'avatar_1',
        text: 'Hi there',
      });

      expect(http.post).toHaveBeenCalledWith('/avatar', {
        avatarId: 'avatar_1',
        text: 'Hi there',
      });
      expect(result.id).toBe('avatar_video');
    });
  });

  describe('captions', () => {
    it('findCaptions GETs and maps captions', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'cap_1', text: 'Line' }])),
      );

      const result = await service.findCaptions('video_1');

      expect(http.get).toHaveBeenCalledWith('/video_1/captions');
      expect(result[0]).toBeInstanceOf(Caption);
      expect(result[0].id).toBe('cap_1');
    });

    it('postCaptions serializes the caption reference', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ text: 'Line' }, { id: 'cap_2' })),
      );

      const result = await service.postCaptions('video_1', 'cap_source');

      expect(http.post).toHaveBeenCalledWith('/video_1/captions', {
        caption: 'cap_source',
      });
      expect(result).toBeInstanceOf(Caption);
      expect(result.id).toBe('cap_2');
    });
  });

  it('postBatchInterpolation unwraps the plain data envelope', async () => {
    const payload = {
      groupId: 'group_1',
      isMergeEnabled: true,
      jobs: [{ id: 'job_1', pairIndex: 0, status: 'queued' }],
      totalJobs: 1,
    };
    http.post.mockResolvedValue(axiosResponse({ data: payload }));

    const result = await service.postBatchInterpolation({
      modelKey: 'model_x',
      pairs: [{ endImageId: 'img_2', startImageId: 'img_1' }],
    });

    expect(http.post).toHaveBeenCalledWith('/interpolation', {
      modelKey: 'model_x',
      pairs: [{ endImageId: 'img_2', startImageId: 'img_1' }],
    });
    expect(result).toEqual(payload);
  });
});
