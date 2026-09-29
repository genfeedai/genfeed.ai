import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import type { CreativePattern } from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { CacheService } from '@api/services/cache/cache.service';
import { Test, type TestingModule } from '@nestjs/testing';

import { PatternMatcherService } from './pattern-matcher.service';

describe('PatternMatcherService', () => {
  let service: PatternMatcherService;
  let creativePatternsService: vi.Mocked<CreativePatternsService>;
  let cacheService: vi.Mocked<CacheService>;

  const orgId = 'org-abc';
  const brandId = 'brand-xyz';
  const cacheKey = `brand-patterns:${orgId}:${brandId}`;

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
