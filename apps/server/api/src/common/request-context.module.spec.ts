import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { RequestContextModule } from '@api/common/request-context.module';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import type { MiddlewareConsumer } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('RequestContextModule', () => {
  it('registers RequestContextMiddleware so Nest resolves its providers here', () => {
    const applied: unknown[] = [];
    const routes: unknown[] = [];
    const consumer = {
      apply: (middleware: unknown) => {
        applied.push(middleware);
        return {
          forRoutes: (...selectedRoutes: unknown[]) => {
            routes.push(...selectedRoutes);
          },
        };
      },
    };

    new RequestContextModule().configure(
      consumer as unknown as MiddlewareConsumer,
    );

    expect(applied).toEqual([RequestContextMiddleware]);
    expect(routes).toEqual(['*path']);
  });

  it('declares the imports, providers, and exports required by request hydration', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, RequestContextModule),
    ).toEqual([OrganizationSettingsModule, SubscriptionsModule]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RequestContextModule),
    ).toEqual([RequestContextMiddleware, RequestContextCacheService]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, RequestContextModule),
    ).toEqual([RequestContextMiddleware, RequestContextCacheService]);
  });

  it('is not registered from AppModule, which cannot see OrganizationSettingsService', () => {
    const appModule = readFileSync(join(SRC_ROOT, 'app.module.ts'), 'utf8');

    expect(appModule).not.toMatch(
      /consumer\.apply\(RequestContextMiddleware\)/,
    );
  });
});
