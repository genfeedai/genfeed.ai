import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { CreativePattern } from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { CacheService } from '@api/services/cache/services/cache.service';
import type { PatternType } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PatternMatcherService {
  constructor(
    private readonly creativePatternsService: CreativePatternsService,
    private readonly cacheService: CacheService,
  ) {}

  async getTopPatternsForBrand(
    orgId: string,
    brandId: string,
    options?: { limit?: number; patternTypes?: PatternType[] },
  ): Promise<CreativePattern[]> {
    const cacheKey = this.cacheService.generateKey(
      'brand-patterns',
      orgId,
      brandId,
    );

    return this.cacheService.getOrSet(
      cacheKey,
      async () =>
        this.creativePatternsService.findTopForBrand(orgId, brandId, options),
      { ttl: 3600 }, // 60 min cache
    );
  }
}
