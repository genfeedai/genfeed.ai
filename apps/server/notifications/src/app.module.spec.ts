vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.PORT = process.env.PORT ?? '3111';
  process.env.DISCORD_BOT_TOKEN =
    process.env.DISCORD_BOT_TOKEN ?? 'discord-token';
  process.env.DISCORD_CHANNEL_ID_POSTS =
    process.env.DISCORD_CHANNEL_ID_POSTS ?? 'discord-posts';
  process.env.DISCORD_CHANNEL_ID_STUDIO =
    process.env.DISCORD_CHANNEL_ID_STUDIO ?? 'discord-studio';
  process.env.DISCORD_CHANNEL_ID_USERS =
    process.env.DISCORD_CHANNEL_ID_USERS ?? 'discord-users';
  process.env.DISCORD_CLIENT_ID =
    process.env.DISCORD_CLIENT_ID ?? 'discord-client';
  process.env.DISCORD_GUILD_ID =
    process.env.DISCORD_GUILD_ID ?? 'discord-guild';
  process.env.GENFEEDAI_API_URL =
    process.env.GENFEEDAI_API_URL ?? 'http://localhost:3010';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 're_test_key';
  process.env.RESEND_FROM_EMAIL =
    process.env.RESEND_FROM_EMAIL ?? 'notifications@example.com';
});

import { NestFactory } from '@nestjs/core';
import { AppModule } from '@notifications/app.module';

describe('AppModule (Notifications)', () => {
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
