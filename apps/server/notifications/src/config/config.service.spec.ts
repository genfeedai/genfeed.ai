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
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    service = new ConfigService();
    expect(service).toBeDefined();
  });

  it('should get environment variable', () => {
    process.env.NODE_ENV = 'development';
    service = new ConfigService();

    expect(service.get('NODE_ENV')).toBe('development');
  });

  it('should detect development environment', () => {
    process.env.NODE_ENV = 'development';
    service = new ConfigService();

    expect(service.isDevelopment).toBe(true);
    expect(service.isProduction).toBe(false);
    expect(service.isStaging).toBe(false);
  });

  it('should detect production environment', () => {
    process.env.NODE_ENV = 'production';
    service = new ConfigService();

    expect(service.isProduction).toBe(true);
    expect(service.isDevelopment).toBe(false);
    expect(service.isStaging).toBe(false);
  });

  it('should detect staging environment', () => {
    process.env.NODE_ENV = 'staging';
    service = new ConfigService();

    expect(service.isStaging).toBe(true);
    expect(service.isDevelopment).toBe(false);
    expect(service.isProduction).toBe(false);
  });

  describe('consumed env-var schema coverage (#484)', () => {
    // Every env var the notifications service reads must be in its schema.
    const consumedKeys = [
      'CHROME_EXTENSION_ID', // main.ts CORS
      'SLACK_NOTIFICATION_BOT_TOKEN', // slack.service
      'GENFEED_CLOUD', // terminal.service cloud gate
      'NEXT_PUBLIC_GENFEED_CLOUD', // terminal.service cloud gate
      'VALIDATION_MAX_FILE_SIZE', // validation.config
      'VALIDATION_VIDEO_FORMATS', // validation.config
      'VALIDATION_IMAGE_FORMATS', // validation.config
      'VALIDATION_AUDIO_FORMATS', // validation.config
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
