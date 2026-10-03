vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.PORT = process.env.PORT ?? '3013';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/genfeed';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
});

import { CacheModule } from '@api/services/cache/cache.module';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@workers/app.module';

describe('AppModule', () => {
  it('imports the API global cache graph used by worker-loaded services', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];

    expect(imports).toContain(CacheModule);
  });

  // Nest's preview mode resolves every provider's constructor dependencies and
  // module export boundary without instantiating anything, so a missing
  // provider or hidden export (v0.2.0: CrunModule hid CrunTaskService) throws
  // here with no Postgres/Redis or external clients. It is the PR-time
  // counterpart of the release-time bundle boot check.
  it('resolves the full dependency graph without instantiating providers', async () => {
    const app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
      preview: true,
    });

    try {
      expect(app).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
