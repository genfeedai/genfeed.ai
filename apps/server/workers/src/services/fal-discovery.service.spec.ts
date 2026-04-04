import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { FalDiscoveryService } from '@workers/services/fal-discovery.service';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('FalDiscoveryService', () => {
  let service: FalDiscoveryService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  function makeConfigService(falApiKey: string | null) {
    return {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'FAL_API_KEY') return falApiKey ?? undefined;
        return undefined;
      }),
    };
  }

  async function buildModule(falApiKey: string | null): Promise<void> {
    configService = makeConfigService(falApiKey);
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FalDiscoveryService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(FalDiscoveryService);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await buildModule('test-fal-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isConfigured()', () => {
    it('returns true when FAL_API_KEY is set', async () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('returns false when FAL_API_KEY is missing', async () => {
      await buildModule(null);
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('discoverModels()', () => {
    it('returns empty array when not configured', async () => {
      await buildModule(null);
      const models = await service.discoverModels();
      expect(models).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns mapped models on success', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          items: [
            {
              id: 'fal-ai/flux-1-schnell',
              pricingInfoOverride: 'Your request will cost $0.003 per image.',
              shortDescription: 'Fast image generation',
              title: 'FLUX Schnell',
            },
          ],
          page: 1,
          pages: 1,
        }),
        ok: true,
      });

      const models = await service.discoverModels();
      expect(models).toHaveLength(1);
      expect(models[0].provider).toBe(ModelProvider.FAL);
      expect(models[0].label).toBe('FLUX Schnell');
      expect(models[0].isActive).toBe(false);
    });

    it('returns empty array when API returns non-OK status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const models = await service.discoverModels();
      expect(models).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('fal.ai API returned 403'),
      );
    });

    it('returns empty array on fetch network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const models = await service.discoverModels();
      expect(models).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns empty array on AbortError timeout', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const models = await service.discoverModels();
      expect(models).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('timed out'),
      );
    });

    it('infers VIDEO category for video model ids', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          items: [{ id: 'fal-ai/fast-video-gen', title: 'Fast Video' }],
          page: 1,
          pages: 1,
        }),
        ok: true,
      });

      const models = await service.discoverModels();
      expect(models[0].category).toBe(ModelCategory.VIDEO);
    });

    it('defaults to IMAGE category for unknown model ids', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          items: [{ id: 'fal-ai/some-unknown-model', title: 'Unknown' }],
          page: 1,
          pages: 1,
        }),
        ok: true,
      });

      const models = await service.discoverModels();
      expect(models[0].category).toBe(ModelCategory.IMAGE);
    });

    it('handles response with flat array format (no .models key)', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi
          .fn()
          .mockResolvedValue([
            { id: 'fal-ai/another-model', title: 'Another' },
          ]),
        ok: true,
      });

      const models = await service.discoverModels();
      expect(models).toHaveLength(1);
    });
  });

  describe('getModelPricing()', () => {
    it('returns 0 when not configured', async () => {
      await buildModule(null);
      const price = await service.getModelPricing('some-model');
      expect(price).toBe(0);
    });

    it('returns margin-applied price on success', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          items: [
            {
              id: 'fal-ai/flux-1',
              pricingInfoOverride: 'Your request will cost $0.01 per image.',
              title: 'Flux 1',
            },
          ],
          page: 1,
          pages: 1,
        }),
        ok: true,
      });

      const price = await service.getModelPricing('fal-ai/flux-1');
      expect(price).toBeGreaterThan(0);
    });

    it('returns minimum floor (2) when cost_per_request is 0', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          items: [{ id: 'fal-ai/free-model', title: 'Free Model' }],
          page: 1,
          pages: 1,
        }),
        ok: true,
      });

      const price = await service.getModelPricing('fal-ai/free-model');
      expect(price).toBe(2);
    });

    it('returns 0 on pricing API non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const price = await service.getModelPricing('fal-ai/missing');
      expect(price).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns 0 on pricing API network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const price = await service.getModelPricing('fal-ai/some-model');
      expect(price).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
