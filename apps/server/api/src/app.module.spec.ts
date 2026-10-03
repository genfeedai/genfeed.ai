vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.PORT = process.env.PORT ?? '3010';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/genfeed';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? 'test';
  process.env.SENTRY_DSN =
    process.env.SENTRY_DSN ?? 'https://test@sentry.io/test';
});

import { AppModule } from '@api/app.module';
import { NestFactory } from '@nestjs/core';

describe('AppModule (API)', () => {
  // Nest's preview mode resolves every provider's constructor dependencies and
  // module export boundary without instantiating anything, so a missing
  // provider or hidden export throws here with no Postgres/Redis or external
  // clients.
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
  }, 60_000);
});
