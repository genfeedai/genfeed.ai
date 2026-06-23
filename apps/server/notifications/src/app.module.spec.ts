import process from 'node:process';

vi.mock('@notifications/services/terminal/terminal.module', () => ({
  TerminalModule: class TerminalModule {},
}));

describe('AppModule (Notifications)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || 'discord-token',
      DISCORD_CHANNEL_ID_POSTS:
        process.env.DISCORD_CHANNEL_ID_POSTS || 'discord-posts',
      DISCORD_CHANNEL_ID_STUDIO:
        process.env.DISCORD_CHANNEL_ID_STUDIO || 'discord-studio',
      DISCORD_CHANNEL_ID_USERS:
        process.env.DISCORD_CHANNEL_ID_USERS || 'discord-users',
      DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || 'discord-client',
      DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID || 'discord-guild',
      GENFEEDAI_API_URL:
        process.env.GENFEEDAI_API_URL || 'http://localhost:3010',
      NODE_ENV: process.env.NODE_ENV || 'test',
      PORT: process.env.PORT || '3011',
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM_EMAIL: 'notifications@example.com',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be importable', async () => {
    const { AppModule } = await import('@notifications/app.module');
    expect(AppModule).toBeDefined();
  });
});
