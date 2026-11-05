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
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD, NestFactory } from '@nestjs/core';

interface ProviderRegistration {
  provide?: unknown;
  useClass?: unknown;
  useExisting?: unknown;
}

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

  // HTTP specs register CombinedAuthGuard as APP_GUARD in their own testing
  // module; this pins that production does too, ahead of every other global
  // guard, so scope checks on gf_ keys run on every route (#9129).
  it('registers CombinedAuthGuard as the first global guard', () => {
    const providers: ProviderRegistration[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) ?? [];
    const globalGuards = providers.filter(
      (provider) => provider.provide === APP_GUARD,
    );

    expect(globalGuards[0]?.useClass).toBe(CombinedAuthGuard);
  });
});
