import { CacheService } from '@api/services/cache/cache.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BrandCacheStrategy {
  constructor(private readonly cacheService: CacheService) {}

  cacheBrand(
    brandId: string,
    brandData: { userId: string } & Record<string, unknown>,
  ): Promise<boolean> {
    const key = this.cacheService.generateKey('brand', brandId);
    return this.cacheService.set(key, brandData, {
      tags: ['brands', `brand:${brandId}`, `user:${brandData.userId}`],
      ttl: 1800,
    });
  }

  getBrand<T = unknown>(brandId: string): Promise<T | null> {
    const key = this.cacheService.generateKey('brand', brandId);
    return this.cacheService.get<T>(key);
  }

  invalidate(brandId: string): Promise<number> {
    return this.cacheService.invalidateByTags([`brand:${brandId}`]);
  }
}
