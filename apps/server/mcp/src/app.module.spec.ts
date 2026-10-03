vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.PORT = '3014';
  process.env.GENFEEDAI_API_URL =
    process.env.GENFEEDAI_API_URL ?? 'http://localhost:3010';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
});

import { AppModule } from '@mcp/app.module';
import { NestFactory } from '@nestjs/core';

describe('AppModule (MCP)', () => {
  it('should be importable', () => {
    expect(AppModule).toBeDefined();
  });

  // Nest's preview mode resolves every provider's constructor dependencies and
  // module export boundary without instantiating anything, so a missing
  // provider or hidden export throws here with no external services.
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
