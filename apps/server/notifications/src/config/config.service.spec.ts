import process from 'node:process';
import { ConfigService } from '@notifications/config/config.service';

// Mock fs and dotenv modules
vi.mock('fs');
vi.mock('dotenv');

describe('ConfigService (Notifications)', () => {
  let service: ConfigService;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };

    // Mock fs.existsSync to return false for all files
    const fs = require('node:fs');
    fs.existsSync = vi.fn().mockReturnValue(false);

    // Set minimal required env vars to avoid validation errors
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    service = new ConfigService();
    expect(service).toBeDefined();
  });

  it('should get environment variable', () => {
    vi.stubEnv('NODE_ENV', 'development');
    service = new ConfigService();

    expect(service.get('NODE_ENV')).toBe('development');
  });

  it('should detect development environment', () => {
    vi.stubEnv('NODE_ENV', 'development');
    service = new ConfigService();

    expect(service.isDevelopment).toBe(true);
    expect(service.isProduction).toBe(false);
    expect(service.isStaging).toBe(false);
  });

  it('should detect production environment', () => {
    vi.stubEnv('NODE_ENV', 'production');
    service = new ConfigService();

    expect(service.isProduction).toBe(true);
    expect(service.isDevelopment).toBe(false);
    expect(service.isStaging).toBe(false);
  });

  it('should detect staging environment', () => {
    vi.stubEnv('NODE_ENV', 'staging');
    service = new ConfigService();

    expect(service.isStaging).toBe(true);
    expect(service.isDevelopment).toBe(false);
    expect(service.isProduction).toBe(false);
  });

  describe('service-enabled helpers', () => {
    it('reports Telegram enabled only with a bot token', () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      service = new ConfigService();
      expect(service.isTelegramEnabled()).toBe(false);

      process.env.TELEGRAM_BOT_TOKEN = 'tg-token';
      service = new ConfigService();
      expect(service.isTelegramEnabled()).toBe(true);
      delete process.env.TELEGRAM_BOT_TOKEN;
    });

    it('reports Discord enabled only with token, client id, and guild id', () => {
      delete process.env.DISCORD_BOT_TOKEN;
      service = new ConfigService();
      expect(service.isDiscordEnabled()).toBe(false);

      process.env.DISCORD_BOT_TOKEN = 'discord-token';
      process.env.DISCORD_CLIENT_ID = 'client-1';
      service = new ConfigService();
      expect(service.isDiscordEnabled()).toBe(false);

      process.env.DISCORD_GUILD_ID = 'guild-1';
      service = new ConfigService();
      expect(service.isDiscordEnabled()).toBe(true);

      delete process.env.DISCORD_BOT_TOKEN;
      delete process.env.DISCORD_CLIENT_ID;
      delete process.env.DISCORD_GUILD_ID;
    });

    it('reports Resend enabled from the setup api key', () => {
      // RESEND_API_KEY is set in test/setup-unit.ts
      service = new ConfigService();
      expect(service.isResendEnabled()).toBe(true);
    });

    it('reports Sentry enabled only with a DSN', () => {
      delete process.env.SENTRY_DSN;
      service = new ConfigService();
      expect(service.isSentryEnabled()).toBe(false);

      process.env.SENTRY_DSN = 'https://key@sentry.io/1';
      service = new ConfigService();
      expect(service.isSentryEnabled()).toBe(true);
      delete process.env.SENTRY_DSN;
    });
  });

  describe('production configuration warnings', () => {
    it('warns about unconfigured optional services in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.SENTRY_DSN;
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.DISCORD_BOT_TOKEN;
      delete process.env.RESEND_API_KEY;

      service = new ConfigService();

      expect(service.isProduction).toBe(true);
      expect(service.isResendEnabled()).toBe(false);
    });

    it('boots without warnings when providers are configured', () => {
      vi.stubEnv('NODE_ENV', 'production');
      process.env.DISCORD_BOT_TOKEN = 'discord-token';
      process.env.SENTRY_DSN = 'https://key@sentry.io/1';
      process.env.TELEGRAM_BOT_TOKEN = 'tg-token';

      service = new ConfigService();

      expect(service.isTelegramEnabled()).toBe(true);

      delete process.env.DISCORD_BOT_TOKEN;
      delete process.env.SENTRY_DSN;
      delete process.env.TELEGRAM_BOT_TOKEN;
    });
  });

  describe('consumed env-var schema coverage (#484)', () => {
    // Every env var the notifications service reads must be in its schema.
    const consumedKeys = [
      'CHROME_EXTENSION_ID', // main.ts CORS
      'SLACK_NOTIFICATION_BOT_TOKEN', // slack.service
      'GENFEED_CLOUD', // terminal.service cloud gate
      'NEXT_PUBLIC_GENFEED_CLOUD', // terminal.service cloud gate
      // The `VALIDATION_*` keys were removed with the service-local
      // `ValidationConfigService` copy — notifications reads none of them.
    ] as const;

    it.each(consumedKeys)('validates %s', (key) => {
      expect(ConfigService.schema.describe().keys).toHaveProperty(key);
    });

    it('rejects a malformed CHROME_EXTENSION_ID at startup', () => {
      process.env.CHROME_EXTENSION_ID = 'too-short';

      expect(() => new ConfigService()).toThrow(/CHROME_EXTENSION_ID/);

      delete process.env.CHROME_EXTENSION_ID;
    });

    it('keeps the new consumed vars optional (absent does not throw)', () => {
      for (const key of consumedKeys) {
        delete process.env[key];
      }

      expect(() => new ConfigService()).not.toThrow();
    });
  });
});
