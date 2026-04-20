import { ConfigService } from '@api/config/config.service';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

interface SkillRegistryEntry {
  slug: string;
  name: string;
  description: string;
  version: string;
  s3Key: string;
  category: string;
}

interface CdnSkillRegistry {
  skills: SkillRegistryEntry[];
  bundle?: { price: number; stripePriceId: string; name: string };
  bundlePrice?: number;
  updatedAt: string;
}

describe('SkillRegistryService', () => {
  let service: SkillRegistryService;
  let _configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockSkills: SkillRegistryEntry[] = [
    {
      category: 'generation',
      description: 'Generate images with AI',
      name: 'Image Gen Pro',
      s3Key: 'skills/image-gen-pro-v1.zip',
      slug: 'image-gen-pro',
      version: '1.0.0',
    },
    {
      category: 'editing',
      description: 'Edit videos with AI',
      name: 'Video Editor',
      s3Key: 'skills/video-editor-v2.zip',
      slug: 'video-editor',
      version: '2.0.0',
    },
  ];

  const mockCdnRegistry: CdnSkillRegistry = {
    bundle: {
      name: 'Skills Pro Bundle',
      price: 4900,
      stripePriceId: 'price_bundle_123',
    },
    skills: mockSkills,
    updatedAt: '2026-01-15T00:00:00Z',
  };

  const getMutableService = () =>
    service as unknown as {
      cacheExpiresAt: number;
    };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillRegistryService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const config: Record<string, string> = {
                GENFEEDAI_CDN_URL: 'https://cdn.genfeed.ai',
              };
              return config[key];
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SkillRegistryService>(SkillRegistryService);
    _configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRegistry', () => {
    it('should fetch registry from CDN and return normalized data', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockCdnRegistry),
        ok: true,
      });
      global.fetch = mockFetch;

      const result = await service.getRegistry();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://cdn.genfeed.ai/skills/registry.json',
      );
      expect(result).toEqual({
        bundlePrice: 49,
        skills: mockSkills,
        updatedAt: '2026-01-15T00:00:00Z',
      });
    });

    it('should use bundlePrice from CDN when available instead of bundle.price', async () => {
      const cdnWithBundlePrice: CdnSkillRegistry = {
        ...mockCdnRegistry,
        bundlePrice: 39,
      };
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(cdnWithBundlePrice),
        ok: true,
      });

      const result = await service.getRegistry();

      expect(result.bundlePrice).toBe(39);
    });

    it('should calculate bundlePrice from bundle.price (cents to dollars) when bundlePrice is not set', async () => {
      const cdnWithoutBundlePrice: CdnSkillRegistry = {
        bundle: {
          name: 'Bundle',
          price: 9900,
          stripePriceId: 'price_123',
        },
        skills: mockSkills,
        updatedAt: '2026-01-15T00:00:00Z',
      };
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(cdnWithoutBundlePrice),
        ok: true,
      });

      const result = await service.getRegistry();

      expect(result.bundlePrice).toBe(99);
    });

    it('should set bundlePrice to 0 when neither bundlePrice nor bundle exist', async () => {
      const cdnNoBundleInfo: CdnSkillRegistry = {
        skills: mockSkills,
        updatedAt: '2026-01-15T00:00:00Z',
      };
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(cdnNoBundleInfo),
        ok: true,
      });

      const result = await service.getRegistry();

      expect(result.bundlePrice).toBe(0);
    });

    it('should return cached registry when cache is valid', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockCdnRegistry),
        ok: true,
      });
      global.fetch = mockFetch;

      const first = await service.getRegistry();
      const second = await service.getRegistry();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('should re-fetch registry after cache expires', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockCdnRegistry),
        ok: true,
      });
      global.fetch = mockFetch;

      await service.getRegistry();

      // Expire cache by setting cacheExpiresAt to the past
      getMutableService().cacheExpiresAt = 0;

      await service.getRegistry();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when CDN returns non-OK response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(service.getRegistry()).rejects.toThrow(
        'Failed to fetch skill registry: 500 Internal Server Error',
      );
    });

    it('should throw when fetch itself fails', async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error('Network unreachable'));

      await expect(service.getRegistry()).rejects.toThrow(
        'Network unreachable',
      );
    });

    it('should log fetching and caching events', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockCdnRegistry),
        ok: true,
      });

      await service.getRegistry();

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('fetching registry'),
        expect.objectContaining({
          url: expect.stringContaining('registry.json'),
        }),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('registry cached'),
        expect.objectContaining({ skillCount: 2 }),
      );
    });
  });

  describe('getBundleStripePriceId', () => {
    it('should return the bundle stripePriceId from registry', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockCdnRegistry),
        ok: true,
      });

      const priceId = await service.getBundleStripePriceId();

      expect(priceId).toBe('price_bundle_123');
    });

    it('should return undefined when no bundle in registry', async () => {
      const cdnNoBundleInfo: CdnSkillRegistry = {
        skills: mockSkills,
        updatedAt: '2026-01-15T00:00:00Z',
      };
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(cdnNoBundleInfo),
        ok: true,
      });

      const priceId = await service.getBundleStripePriceId();

      expect(priceId).toBeUndefined();
    });

    it('should use cached data if cache is valid', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockCdnRegistry),
        ok: true,
      });
      global.fetch = mockFetch;

      await service.getRegistry();
      await service.getBundleStripePriceId();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should re-fetch if cache is expired', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockCdnRegistry),
        ok: true,
      });
      global.fetch = mockFetch;

      await service.getRegistry();

      // Expire cache
      getMutableService().cacheExpiresAt = 0;

      await service.getBundleStripePriceId();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSkillBySlug', () => {
    const registry = {
      bundlePrice: 49,
      skills: mockSkills,
      updatedAt: '2026-01-15T00:00:00Z',
    };

    it('should return the skill matching the slug', () => {
      const result = service.getSkillBySlug(registry, 'image-gen-pro');

      expect(result).toEqual(mockSkills[0]);
    });

    it('should return the second skill when its slug is queried', () => {
      const result = service.getSkillBySlug(registry, 'video-editor');

      expect(result).toEqual(mockSkills[1]);
    });

    it('should return undefined when slug is not found', () => {
      const result = service.getSkillBySlug(registry, 'nonexistent-skill');

      expect(result).toBeUndefined();
    });

    it('should return undefined when skills array is empty', () => {
      const emptyRegistry = {
        bundlePrice: 0,
        skills: [] as SkillRegistryEntry[],
        updatedAt: '2026-01-15T00:00:00Z',
      };

      const result = service.getSkillBySlug(emptyRegistry, 'image-gen-pro');

      expect(result).toBeUndefined();
    });
  });
});
