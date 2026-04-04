import { CacheService } from '@api/services/cache/services/cache.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UserCacheStrategy {
  constructor(private readonly cacheService: CacheService) {}

  cacheUser(userId: string, userData: unknown): Promise<boolean> {
    const key = this.cacheService.generateKey('user', userId);
    return this.cacheService.set(key, userData, {
      tags: ['users', `user:${userId}`],
      ttl: 3600,
    });
  }

  getUser<T = unknown>(userId: string): Promise<T | null> {
    const key = this.cacheService.generateKey('user', userId);
    return this.cacheService.get<T>(key);
  }

  invalidate(userId: string): Promise<number> {
    return this.cacheService.invalidateByTags([`user:${userId}`]);
  }
}
