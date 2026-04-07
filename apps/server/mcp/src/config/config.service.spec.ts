import { ConfigService } from '@mcp/config/config.service';

describe('ConfigService (MCP)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GENFEEDAI_API_URL: 'http://localhost:3010',
      NODE_ENV: 'test',
      PORT: '3010',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    const service = new ConfigService();
    expect(service).toBeDefined();
  });

  it('should get environment variable', () => {
    process.env.NODE_ENV = 'development';
    const service = new ConfigService();

    expect(service.get('NODE_ENV')).toBe('development');
  });

  it('should detect development environment', () => {
    process.env.NODE_ENV = 'development';
    const service = new ConfigService();

    expect(service.isDevelopment).toBe(true);
    expect(service.isProduction).toBe(false);
    expect(service.isStaging).toBe(false);
  });

  it('should detect production environment', () => {
    process.env.NODE_ENV = 'production';
    const service = new ConfigService();

    expect(service.isProduction).toBe(true);
    expect(service.isDevelopment).toBe(false);
    expect(service.isStaging).toBe(false);
  });

  it('should detect staging environment', () => {
    process.env.NODE_ENV = 'staging';
    const service = new ConfigService();

    expect(service.isStaging).toBe(true);
    expect(service.isDevelopment).toBe(false);
    expect(service.isProduction).toBe(false);
  });
});
