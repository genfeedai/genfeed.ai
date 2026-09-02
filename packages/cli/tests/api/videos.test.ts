import { IngredientStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideo, getVideo } from '@/api/videos';

const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();
const mockFetch = vi.fn();

vi.mock('@/config/store', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

describe('api/videos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('createVideo', () => {
    it('sends POST and flattens JSON:API response', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            model: 'google-veo-3',
            status: IngredientStatus.PROCESSING,
          },
          id: 'vid-1',
          type: 'video',
        },
      });

      const result = await createVideo({
        brandId: 'brand-1',
        text: 'A flying bird',
      });

      expect(mockFetch).toHaveBeenCalledWith('/videos', {
        body: {
          brandId: 'brand-1',
          text: 'A flying bird',
        },
        method: 'POST',
      });
      expect(result.id).toBe('vid-1');
      expect(result.status).toBe(IngredientStatus.PROCESSING);
    });

    // CreateVideoDto declares `brandId`, and the API's ValidationPipe runs with
    // `whitelist: true` — a legacy `brand` key would be stripped without error
    // and the generation would silently fall back to the org's default brand.
    it('sends brandId and never the legacy brand key', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: { model: 'google-veo-3', status: IngredientStatus.PROCESSING },
          id: 'vid-3',
          type: 'video',
        },
      });

      await createVideo({
        brandId: 'brand-1',
        text: 'A flying bird',
      });

      const body = mockFetch.mock.calls[0][1].body as Record<string, unknown>;

      expect(body).toHaveProperty('brandId', 'brand-1');
      expect(body).not.toHaveProperty('brand');
    });

    it('forwards cancellation to video generation', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: { model: 'google-veo-3', status: IngredientStatus.PROCESSING },
          id: 'vid-4',
          type: 'video',
        },
      });
      const controller = new AbortController();
      const request = { brandId: 'brand-1', text: 'Ocean waves' };

      await createVideo(request, controller.signal);

      expect(mockFetch).toHaveBeenCalledWith('/videos', {
        body: request,
        method: 'POST',
        signal: controller.signal,
      });
    });

    it('passes optional duration and resolution', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            duration: 10,
            model: 'google-veo-3',
            resolution: '1080p',
            status: IngredientStatus.PROCESSING,
          },
          id: 'vid-2',
          type: 'video',
        },
      });

      const result = await createVideo({
        brandId: 'brand-1',
        duration: 10,
        resolution: '1080p',
        text: 'Ocean waves',
      });

      expect(result.duration).toBe(10);
      expect(result.resolution).toBe('1080p');
    });
  });

  describe('getVideo', () => {
    it('flattens generated video with url', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            completedAt: '2024-01-01T00:02:00Z',
            duration: 5,
            model: 'google-veo-3',
            resolution: '1080p',
            status: IngredientStatus.GENERATED,
            url: 'https://cdn.genfeed.ai/vid.mp4',
          },
          id: 'vid-1',
          type: 'video',
        },
      });

      const result = await getVideo('vid-1');

      expect(mockFetch).toHaveBeenCalledWith('/videos/vid-1', { method: 'GET' });
      expect(result.id).toBe('vid-1');
      expect(result.status).toBe(IngredientStatus.GENERATED);
      expect(result.url).toBe('https://cdn.genfeed.ai/vid.mp4');
      expect(result.duration).toBe(5);
    });

    it('flattens failed video with error', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            error: 'Generation failed',
            model: 'google-veo-3',
            status: IngredientStatus.FAILED,
          },
          id: 'vid-1',
          type: 'video',
        },
      });

      const result = await getVideo('vid-1');

      expect(result.status).toBe(IngredientStatus.FAILED);
      expect(result.error).toBe('Generation failed');
    });

    it('propagates errors', async () => {
      mockFetch.mockRejectedValue(new Error('Not found'));

      await expect(getVideo('invalid')).rejects.toThrow('Not found');
    });
  });
});
