import { ConfigService } from '@slack/config/config.service';

vi.mock('fs');
vi.mock('dotenv');

/**
 * Consolidated from the two pre-existing suites (this file and
 * `src/config/__tests__/config.service.spec.ts`). Both were written against the
 * old `getDefaultConfigService()` base, which read `process.env` live on every
 * `get()`: one mocked that base away entirely, the other constructed the
 * service once and mutated `process.env` afterwards. `createServiceConfig`
 * snapshots and validates config at construction time, so every case now
 * constructs after setting env — matching the discord/telegram harness.
 */
describe('ConfigService (Slack)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };

    const fs = require('node:fs');
    fs.existsSync = vi.fn().mockReturnValue(false);

    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should be defined and instantiable as a class', () => {
    const service = new ConfigService();
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ConfigService);
  });

  describe('API_URL', () => {
    it('should return GENFEEDAI_API_URL when set', () => {
      process.env.GENFEEDAI_API_URL = 'https://api.example.com';
      const service = new ConfigService();
      expect(service.API_URL).toBe('https://api.example.com');
    });

    it('should return default localhost URL when env var is not set', () => {
      delete process.env.GENFEEDAI_API_URL;
      const service = new ConfigService();
      expect(service.API_URL).toBe('http://localhost:3010');
    });

    it('should return default when env var is empty string', () => {
      process.env.GENFEEDAI_API_URL = '';
      const service = new ConfigService();
      expect(service.API_URL).toBe('http://localhost:3010');
    });

    it('should reflect updated env value', () => {
      process.env.GENFEEDAI_API_URL = 'https://staging.genfeed.ai';
      const service = new ConfigService();
      expect(service.API_URL).toBe('https://staging.genfeed.ai');
    });

    it('should return a string type', () => {
      const service = new ConfigService();
      expect(typeof service.API_URL).toBe('string');
    });
  });

  describe('API_KEY', () => {
    it('should return GENFEEDAI_API_KEY when set', () => {
      process.env.GENFEEDAI_API_KEY = 'secret-api-key-xyz';
      const service = new ConfigService();
      expect(service.API_KEY).toBe('secret-api-key-xyz');
    });

    it('should return empty string when env var is not set', () => {
      delete process.env.GENFEEDAI_API_KEY;
      const service = new ConfigService();
      expect(service.API_KEY).toBe('');
    });

    it('should return empty string when env var is empty string', () => {
      process.env.GENFEEDAI_API_KEY = '';
      const service = new ConfigService();
      expect(service.API_KEY).toBe('');
    });

    it('should support keys with special characters', () => {
      process.env.GENFEEDAI_API_KEY = 'sk-test_ABC-123.xyz';
      const service = new ConfigService();
      expect(service.API_KEY).toBe('sk-test_ABC-123.xyz');
    });

    it('should not expose secrets in non-string format', () => {
      process.env.GENFEEDAI_API_KEY = 'secret-key';
      const service = new ConfigService();
      expect(typeof service.API_KEY).toBe('string');
      expect(service.API_KEY).not.toBeNull();
    });
  });
});
