vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.PORT = process.env.PORT ?? '3013';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/genfeed';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
});

import { CacheModule } from '@api/services/cache/cache.module';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '@workers/app.module';

describe('AppModule', () => {
  it('imports the API global cache graph used by worker-loaded services', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];

    expect(imports).toContain(CacheModule);
  });
});
