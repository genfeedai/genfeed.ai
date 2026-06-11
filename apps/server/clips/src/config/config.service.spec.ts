import process from 'node:process';
import { ConfigService } from '@clips/config/config.service';

describe('ConfigService (Clips)', () => {
  let configService: ConfigService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3015';
    configService = new ConfigService();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.GENFEEDAI_API_URL;
    delete process.env.GENFEEDAI_MICROSERVICES_FILES_URL;
    delete process.env.GENFEEDAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('should be defined', () => {
    expect(configService).toBeDefined();
  });

  describe('startup validation', () => {
    // Pre-migration, clips extended an unvalidated config (get => process.env[k] || '')
    // and never threw. After consolidating onto createServiceConfig, baseSchema's
    // required PORT is enforced at construction — proving validation now runs.
    it('throws when a required base key (PORT) is missing', () => {
      delete process.env.PORT;
      expect(() => new ConfigService()).toThrow('Config validation error');
    });
  });

  describe('API_URL', () => {
    it('returns the configured API URL', () => {
      process.env.GENFEEDAI_API_URL = 'http://api.example.com';
      const svc = new ConfigService();
      expect(svc.API_URL).toBe('http://api.example.com');
    });

    it('defaults to localhost:3010 when not configured', () => {
      delete process.env.GENFEEDAI_API_URL;
      const svc = new ConfigService();
      expect(svc.API_URL).toBe('http://localhost:3010');
    });
  });

  describe('FILES_URL', () => {
    it('returns the configured FILES URL', () => {
      process.env.GENFEEDAI_MICROSERVICES_FILES_URL =
        'http://files.example.com';
      const svc = new ConfigService();
      expect(svc.FILES_URL).toBe('http://files.example.com');
    });

    it('defaults to localhost:3012 when not configured', () => {
      delete process.env.GENFEEDAI_MICROSERVICES_FILES_URL;
      const svc = new ConfigService();
      expect(svc.FILES_URL).toBe('http://localhost:3012');
    });
  });

  describe('API_KEY', () => {
    it('returns the configured API key', () => {
      process.env.GENFEEDAI_API_KEY = 'secret-key-123';
      const svc = new ConfigService();
      expect(svc.API_KEY).toBe('secret-key-123');
    });

    it('defaults to empty string when not set', () => {
      delete process.env.GENFEEDAI_API_KEY;
      const svc = new ConfigService();
      expect(svc.API_KEY).toBe('');
    });
  });

  describe('OPENROUTER_API_KEY', () => {
    it('returns the configured OpenRouter API key', () => {
      process.env.OPENROUTER_API_KEY = 'or-key-456';
      const svc = new ConfigService();
      expect(svc.OPENROUTER_API_KEY).toBe('or-key-456');
    });

    it('defaults to empty string when not set', () => {
      delete process.env.OPENROUTER_API_KEY;
      const svc = new ConfigService();
      expect(svc.OPENROUTER_API_KEY).toBe('');
    });
  });
});
