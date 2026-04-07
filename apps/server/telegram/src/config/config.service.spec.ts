import { ConfigService } from '@telegram/config/config.service';

vi.mock('fs');
vi.mock('dotenv');

describe('ConfigService (Telegram)', () => {
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

  it('should be defined', () => {
    const service = new ConfigService();
    expect(service).toBeDefined();
  });

  it('should return default API_URL when env var is not set', () => {
    delete process.env.GENFEEDAI_API_URL;
    const service = new ConfigService();
    expect(service.API_URL).toBe('http://localhost:3010');
  });

  it('should return configured API_URL when env var is set', () => {
    process.env.GENFEEDAI_API_URL = 'https://api.genfeed.ai';
    const service = new ConfigService();
    expect(service.API_URL).toBe('https://api.genfeed.ai');
  });

  it('should return empty string for API_KEY when not set', () => {
    delete process.env.GENFEEDAI_API_KEY;
    const service = new ConfigService();
    expect(service.API_KEY).toBe('');
  });

  it('should return configured API_KEY when env var is set', () => {
    process.env.GENFEEDAI_API_KEY = 'tg-api-key-456';
    const service = new ConfigService();
    expect(service.API_KEY).toBe('tg-api-key-456');
  });

  it('should detect development environment', () => {
    process.env.NODE_ENV = 'development';
    const service = new ConfigService();
    expect(service.isDevelopment).toBe(true);
    expect(service.isProduction).toBe(false);
    expect(service.isTest).toBe(false);
  });

  it('should detect production environment', () => {
    process.env.NODE_ENV = 'production';
    const service = new ConfigService();
    expect(service.isProduction).toBe(true);
    expect(service.isDevelopment).toBe(false);
    expect(service.isTest).toBe(false);
  });

  it('should not treat staging as development, production, or test', () => {
    process.env.NODE_ENV = 'staging';
    const service = new ConfigService();
    expect(service.isDevelopment).toBe(false);
    expect(service.isProduction).toBe(false);
    expect(service.isTest).toBe(false);
  });

  it('should detect test environment', () => {
    process.env.NODE_ENV = 'test';
    const service = new ConfigService();
    expect(service.isTest).toBe(true);
  });

  it('should get NODE_ENV via get()', () => {
    process.env.NODE_ENV = 'development';
    const service = new ConfigService();
    expect(service.get('NODE_ENV')).toBe('development');
  });
});
