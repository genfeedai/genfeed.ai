import { IngredientStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImage, getImage } from '@/api/images';

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

describe('api/images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('createImage', () => {
    it('sends POST and flattens JSON:API response', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            createdAt: '2024-01-01T00:00:00Z',
            model: 'imagen-4',
            status: IngredientStatus.PROCESSING,
            updatedAt: '2024-01-01T00:00:00Z',
          },
          id: 'img-1',
          type: 'image',
        },
      });

      const result = await createImage({
        brandId: 'brand-1',
        text: 'A sunset over mountains',
      });

      expect(mockFetch).toHaveBeenCalledWith('/images', {
        body: {
          brandId: 'brand-1',
          text: 'A sunset over mountains',
        },
        method: 'POST',
      });
      expect(result.id).toBe('img-1');
      expect(result.status).toBe(IngredientStatus.PROCESSING);
      expect(result.model).toBe('imagen-4');
    });

    // CreateImageDto declares `brandId`, and the API's ValidationPipe runs with
    // `whitelist: true` — a legacy `brand` key would be stripped without error
    // and the generation would silently fall back to the org's default brand.
    it('sends brandId and never the legacy brand key', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: { model: 'imagen-4', status: IngredientStatus.PROCESSING },
          id: 'img-3',
          type: 'image',
        },
      });

      await createImage({
        brandId: 'brand-1',
        text: 'A sunset over mountains',
      });

      const body = mockFetch.mock.calls[0][1].body as Record<string, unknown>;

      expect(body).toHaveProperty('brandId', 'brand-1');
      expect(body).not.toHaveProperty('brand');
    });

    it('forwards cancellation to image generation', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: { model: 'imagen-4', status: IngredientStatus.PROCESSING },
          id: 'img-4',
          type: 'image',
        },
      });
      const controller = new AbortController();
      const request = { brandId: 'brand-1', text: 'A launch poster' };

      await createImage(request, controller.signal);

      expect(mockFetch).toHaveBeenCalledWith('/images', {
        body: request,
        method: 'POST',
        signal: controller.signal,
      });
    });

    it('passes optional dimensions', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            height: 768,
            model: 'imagen-4',
            status: IngredientStatus.PROCESSING,
            width: 1024,
          },
          id: 'img-2',
          type: 'image',
        },
      });

      const result = await createImage({
        brandId: 'brand-1',
        height: 768,
        text: 'A cat',
        width: 1024,
      });

      expect(result.width).toBe(1024);
      expect(result.height).toBe(768);
    });

    it('forwards the complete public image-generation controls', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: { model: 'auto', status: IngredientStatus.PROCESSING },
          id: 'img-advanced',
          type: 'image',
        },
      });

      await createImage({
        autoSelectModel: true,
        blacklist: ['logo'],
        brandId: 'brand-1',
        brandingMode: 'brand',
        camera: 'low-angle',
        fidelityMode: 'strict',
        format: 'portrait',
        lens: '85mm',
        lighting: 'studio',
        mood: 'confident',
        negativePrompt: 'blur',
        outputs: 3,
        prioritize: 'quality',
        references: ['reference-1'],
        scene: 'rooftop',
        seed: 42,
        style: 'editorial',
        tags: ['tag-1'],
        text: 'A product launch',
      });

      expect(mockFetch.mock.calls[0][1].body).toMatchObject({
        autoSelectModel: true,
        blacklist: ['logo'],
        brandingMode: 'brand',
        camera: 'low-angle',
        fidelityMode: 'strict',
        outputs: 3,
        references: ['reference-1'],
        seed: 42,
        tags: ['tag-1'],
      });
    });
  });

  describe('getImage', () => {
    it('flattens generated image with url', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            completedAt: '2024-01-01T00:01:00Z',
            height: 1024,
            model: 'imagen-4',
            status: IngredientStatus.GENERATED,
            url: 'https://cdn.genfeed.ai/img.png',
            width: 1024,
          },
          id: 'img-1',
          type: 'image',
        },
      });

      const result = await getImage('img-1');

      expect(mockFetch).toHaveBeenCalledWith('/images/img-1', { method: 'GET' });
      expect(result.id).toBe('img-1');
      expect(result.status).toBe(IngredientStatus.GENERATED);
      expect(result.url).toBe('https://cdn.genfeed.ai/img.png');
      expect(result.width).toBe(1024);
    });

    it('flattens failed image with error', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            error: 'Content policy violation',
            model: 'imagen-4',
            status: IngredientStatus.FAILED,
          },
          id: 'img-1',
          type: 'image',
        },
      });

      const result = await getImage('img-1');

      expect(result.status).toBe(IngredientStatus.FAILED);
      expect(result.error).toBe('Content policy violation');
    });

    it('propagates errors', async () => {
      mockFetch.mockRejectedValue(new Error('Not found'));

      await expect(getImage('invalid')).rejects.toThrow('Not found');
    });
  });
});
