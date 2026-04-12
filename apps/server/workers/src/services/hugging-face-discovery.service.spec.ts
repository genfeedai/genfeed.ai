import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { HuggingFaceDiscoveryService } from '@workers/services/hugging-face-discovery.service';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Minimal HuggingFace model fixture */
function makeHfModel(overrides: Record<string, unknown> = {}) {
  return {
    downloads: 1000,
    gated: false,
    id: 'org/some-model',
    likes: 50,
    pipeline_tag: 'text-to-image',
    private: false,
    tags: [],
    ...overrides,
  };
}

/** Stub a single-page fetch response with no pagination */
function stubFetchPage(models: unknown[]) {
  mockFetch.mockResolvedValueOnce({
    headers: { get: vi.fn().mockReturnValue(null) },
    json: vi.fn().mockResolvedValue(models),
    ok: true,
    status: 200,
  });
}

describe('HuggingFaceDiscoveryService', () => {
  let service: HuggingFaceDiscoveryService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  function makeConfigService(apiKey: string | null) {
    return {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'HUGGINGFACE_API_KEY') return apiKey ?? undefined;
        return undefined;
      }),
    };
  }

  async function buildModule(apiKey: string | null): Promise<void> {
    configService = makeConfigService(apiKey);
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HuggingFaceDiscoveryService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(HuggingFaceDiscoveryService);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await buildModule('test-hf-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isConfigured()', () => {
    it('returns true when HUGGINGFACE_API_KEY is set', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('returns false when HUGGINGFACE_API_KEY is missing', async () => {
      await buildModule(null);
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('discoverModels()', () => {
    it('returns empty array when API returns non-OK status', async () => {
      mockFetch.mockResolvedValue({
        headers: { get: vi.fn().mockReturnValue(null) },
        ok: false,
        status: 503,
      });

      const models = await service.discoverModels();
      expect(models).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('HuggingFace API returned 503'),
      );
    });

    it('returns mapped models with correct provider', async () => {
      // stub one response per pipeline tag — return empty for all but the first
      mockFetch.mockResolvedValue({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([]),
        ok: true,
        status: 200,
      });
      // Override first call (text-to-image tag) with one model
      mockFetch.mockResolvedValueOnce({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([makeHfModel()]),
        ok: true,
        status: 200,
      });

      const models = await service.discoverModels();
      expect(models.length).toBeGreaterThanOrEqual(1);
      expect(models[0].provider).toBe(ModelProvider.HUGGINGFACE);
      expect(models[0].isActive).toBe(false);
    });

    it('filters out private models', async () => {
      mockFetch.mockResolvedValue({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([]),
        ok: true,
        status: 200,
      });
      mockFetch.mockResolvedValueOnce({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi
          .fn()
          .mockResolvedValue([
            makeHfModel({ private: true, id: 'org/secret' }),
          ]),
        ok: true,
        status: 200,
      });

      const models = await service.discoverModels();
      const found = models.find((m) => m.key === 'org/secret');
      expect(found).toBeUndefined();
    });

    it('filters out gated models', async () => {
      mockFetch.mockResolvedValue({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([]),
        ok: true,
        status: 200,
      });
      mockFetch.mockResolvedValueOnce({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi
          .fn()
          .mockResolvedValue([makeHfModel({ gated: true, id: 'org/gated' })]),
        ok: true,
        status: 200,
      });

      const models = await service.discoverModels();
      const found = models.find((m) => m.key === 'org/gated');
      expect(found).toBeUndefined();
    });

    it('infers VIDEO category for text-to-video pipeline tag', async () => {
      mockFetch.mockResolvedValue({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([]),
        ok: true,
        status: 200,
      });
      // text-to-video is the 4th allowed tag — stub enough empty responses first
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({
          headers: { get: vi.fn().mockReturnValue(null) },
          json: vi.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }
      mockFetch.mockResolvedValueOnce({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi
          .fn()
          .mockResolvedValue([
            makeHfModel({ id: 'org/video-gen', pipeline_tag: 'text-to-video' }),
          ]),
        ok: true,
        status: 200,
      });

      const models = await service.discoverModels();
      const videoModel = models.find((m) => m.key === 'org/video-gen');
      expect(videoModel?.category).toBe(ModelCategory.VIDEO);
    });

    it('handles fetch network error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const models = await service.discoverModels();
      expect(models).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('handles AbortError timeout gracefully', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      // remaining tags fall through to empty
      mockFetch.mockResolvedValue({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([]),
        ok: true,
        status: 200,
      });

      const models = await service.discoverModels();
      // No crash, errors logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('timed out'),
      );
      // Still returns whatever other tags produced
      expect(Array.isArray(models)).toBe(true);
    });

    it('deduplicates models across pipeline tags', async () => {
      const sameModel = makeHfModel({ id: 'org/dual-purpose' });
      // Return the same model for multiple tag fetches
      stubFetchPage([sameModel]);
      mockFetch.mockResolvedValue({
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([sameModel]),
        ok: true,
        status: 200,
      });

      const models = await service.discoverModels();
      const occurrences = models.filter((m) => m.key === 'org/dual-purpose');
      expect(occurrences).toHaveLength(1);
    });
  });
});
