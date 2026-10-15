import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { ReferenceDataSyncModule } from '@api/seeds/reference-data-sync.module';
import { ReferenceDataSyncService } from '@api/seeds/reference-data-sync.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

describe('ReferenceDataSyncModule bootstrap', () => {
  it('resolves the live sync dependency graph without the API AppModule', async () => {
    const module = await Test.createTestingModule({
      imports: [ReferenceDataSyncModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          key === 'REDIS_DRIVER' ? 'in-process' : undefined,
      })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      expect(module.get(ReferenceDataSyncService)).toBeInstanceOf(
        ReferenceDataSyncService,
      );
      expect(module.get(AccessBootstrapCacheService)).toBeInstanceOf(
        AccessBootstrapCacheService,
      );
      expect(module.get(RedisService)).toBeDefined();
    } finally {
      await module.close();
    }
  });
});
