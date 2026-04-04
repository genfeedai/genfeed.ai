import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideo, getVideo } from '../../src/api/videos.js';

const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();
const mockFetch = vi.fn();

vi.mock('../../src/config/store.js', () => ({
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
            status: 'processing',
          },
          id: 'vid-1',
          type: 'video',
        },
      });

      const result = await createVideo({
        brand: 'brand-1',
        text: 'A flying bird',
      });

      expect(mockFetch).toHaveBeenCalledWith('/videos', {
        body: {
          brand: 'brand-1',
          text: 'A flying bird',
        },
        method: 'POST',
      });
      expect(result.id).toBe('vid-1');
      expect(result.status).toBe('processing');
    });

    it('passes optional duration and resolution', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            duration: 10,
            model: 'google-veo-3',
            resolution: '1080p',
            status: 'processing',
          },
          id: 'vid-2',
          type: 'video',
        },
      });

      const result = await createVideo({
        brand: 'brand-1',
        duration: 10,
        resolution: '1080p',
        text: 'Ocean waves',
      });

      expect(result.duration).toBe(10);
      expect(result.resolution).toBe('1080p');
    });
  });

  describe('getVideo', () => {
    it('flattens completed video with url', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            completedAt: '2024-01-01T00:02:00Z',
            duration: 5,
            model: 'google-veo-3',
            resolution: '1080p',
            status: 'completed',
            url: 'https://cdn.genfeed.ai/vid.mp4',
          },
          id: 'vid-1',
          type: 'video',
        },
      });

      const result = await getVideo('vid-1');

      expect(mockFetch).toHaveBeenCalledWith('/videos/vid-1', { method: 'GET' });
      expect(result.id).toBe('vid-1');
      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.genfeed.ai/vid.mp4');
      expect(result.duration).toBe(5);
    });

    it('flattens failed video with error', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            error: 'Generation failed',
            model: 'google-veo-3',
            status: 'failed',
          },
          id: 'vid-1',
          type: 'video',
        },
      });

      const result = await getVideo('vid-1');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Generation failed');
    });

    it('propagates errors', async () => {
      mockFetch.mockRejectedValue(new Error('Not found'));

      await expect(getVideo('invalid')).rejects.toThrow('Not found');
    });
  });
});
