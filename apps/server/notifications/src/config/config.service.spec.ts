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
});
