import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import type { CreativePattern } from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { CacheService } from '@api/services/cache/services/cache.service';
import { Test, type TestingModule } from '@nestjs/testing';

import { PatternMatcherService } from './pattern-matcher.service';

describe('PatternMatcherService', () => {
  let service: PatternMatcherService;
  let creativePatternsService: vi.Mocked<CreativePatternsService>;
  let cacheService: vi.Mocked<CacheService>;

  const orgId = 'org-abc';
  const brandId = 'brand-xyz';
  const cacheKey = `brand-patterns:${orgId}:${brandId}`;

  const mockPatterns: Partial<CreativePattern>[] = [
    { _id: 'pattern-1' } as never,
    { _id: 'pattern-2' } as never,
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatternMatcherService,
        {
          provide: CreativePatternsService,
          useValue: { findTopForBrand: vi.fn() },
        },
        {
          provide: CacheService,
          useValue: {
            generateKey: vi.fn(),
            getOrSet: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PatternMatcherService);
    creativePatternsService = module.get(CreativePatternsService);
    cacheService = module.get(CacheService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate a cache key with brand-patterns prefix', async () => {
    cacheService.generateKey.mockReturnValue(cacheKey);
    cacheService.getOrSet.mockResolvedValue(mockPatterns as CreativePattern[]);

    await service.getTopPatternsForBrand(orgId, brandId);

    expect(cacheService.generateKey).toHaveBeenCalledWith(
      'brand-patterns',
      orgId,
      brandId,
    );
  });

  it('should call getOrSet with the generated cache key and 1hr TTL', async () => {
    cacheService.generateKey.mockReturnValue(cacheKey);
    cacheService.getOrSet.mockResolvedValue(mockPatterns as CreativePattern[]);

    await service.getTopPatternsForBrand(orgId, brandId);

    expect(cacheService.getOrSet).toHaveBeenCalledWith(
      cacheKey,
      expect.any(Function),
      { ttl: 3600 },
    );
  });

  it('should return patterns from the cache', async () => {
    cacheService.generateKey.mockReturnValue(cacheKey);
    cacheService.getOrSet.mockResolvedValue(mockPatterns as CreativePattern[]);

    const result = await service.getTopPatternsForBrand(orgId, brandId);

    expect(result).toEqual(mockPatterns);
  });

  it('should invoke creativePatternsService.findTopForBrand inside getOrSet callback', async () => {
    cacheService.generateKey.mockReturnValue(cacheKey);
    // Execute the factory fn synchronously to verify what it calls
    cacheService.getOrSet.mockImplementation(
      async (_key: string, fn: () => Promise<CreativePattern[]>) => fn(),
    );
    creativePatternsService.findTopForBrand.mockResolvedValue(
      mockPatterns as CreativePattern[],
    );

    await service.getTopPatternsForBrand(orgId, brandId);

    expect(creativePatternsService.findTopForBrand).toHaveBeenCalledWith(
      orgId,
      brandId,
      undefined,
    );
  });

  it('should pass options to findTopForBrand', async () => {
    cacheService.generateKey.mockReturnValue(cacheKey);
    cacheService.getOrSet.mockImplementation(
      async (_key: string, fn: () => Promise<CreativePattern[]>) => fn(),
    );
    creativePatternsService.findTopForBrand.mockResolvedValue([]);

    const options = { limit: 5, patternTypes: ['hook'] as never };
    await service.getTopPatternsForBrand(orgId, brandId, options);

    expect(creativePatternsService.findTopForBrand).toHaveBeenCalledWith(
      orgId,
      brandId,
      options,
    );
  });

  it('should return empty array when no patterns exist', async () => {
    cacheService.generateKey.mockReturnValue(cacheKey);
    cacheService.getOrSet.mockResolvedValue([]);

    const result = await service.getTopPatternsForBrand(orgId, brandId);

    expect(result).toEqual([]);
  });

  it('should propagate errors from getOrSet', async () => {
    cacheService.generateKey.mockReturnValue(cacheKey);
    cacheService.getOrSet.mockRejectedValue(new Error('redis unavailable'));

    await expect(
      service.getTopPatternsForBrand(orgId, brandId),
    ).rejects.toThrow('redis unavailable');
  });

  it('should propagate errors from findTopForBrand within factory fn', async () => {
    cacheService.generateKey.mockReturnValue(cacheKey);
    cacheService.getOrSet.mockImplementation(
      async (_key: string, fn: () => Promise<CreativePattern[]>) => fn(),
    );
    creativePatternsService.findTopForBrand.mockRejectedValue(
      new Error('db error'),
    );

    await expect(
      service.getTopPatternsForBrand(orgId, brandId),
    ).rejects.toThrow('db error');
  });
});
