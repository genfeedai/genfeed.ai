import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { RequestContextModule } from '@api/common/request-context.module';
import type { MiddlewareConsumer } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('RequestContextModule', () => {
  it('registers RequestContextMiddleware so Nest resolves its providers here', () => {
    const applied: unknown[] = [];
    const consumer = {
      apply: (middleware: unknown) => {
        applied.push(middleware);
        return { forRoutes: () => undefined };
      },
    };

    new RequestContextModule().configure(
      consumer as unknown as MiddlewareConsumer,
    );

    expect(applied).toEqual([RequestContextMiddleware]);
  });

  it('is not registered from AppModule, which cannot see OrganizationSettingsService', () => {
    const appModule = readFileSync(join(SRC_ROOT, 'app.module.ts'), 'utf8');

    expect(appModule).not.toMatch(
      /consumer\.apply\(RequestContextMiddleware\)/,
    );
  });
});
