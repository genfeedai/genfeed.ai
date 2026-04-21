import { ConfigService } from '@workers/config/config.service';

describe('ConfigService (Workers)', () => {
  let configService: ConfigService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.GF_DEV_ENABLE_SCHEDULERS;
    process.env.PORT = '3000';
    process.env.SENTRY_ENVIRONMENT = 'test';
    process.env.SENTRY_DSN = 'https://test@sentry.io/test';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/genfeed';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.PORT = '3000';

    configService = new ConfigService();
  });

  afterEach(() => {
    delete process.env.GF_DEV_ENABLE_SCHEDULERS;
    delete process.env.DATABASE_URL;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
  });

  describe('constructor', () => {
    it('should create ConfigService instance', () => {
      expect(configService).toBeDefined();
    });

    it('should validate required environment variables', () => {
      expect(() => new ConfigService()).not.toThrow();
    });

    it('should require DATABASE_URL', () => {
      delete process.env.DATABASE_URL;

      expect(() => new ConfigService()).toThrow(/DATABASE_URL/);
    });
  });

  describe('get', () => {
    it('should return REDIS_URL', () => {
      const redisUrl = configService.get('REDIS_URL');
      expect(redisUrl).toBe('redis://localhost:6379');
    });

    it('should return DATABASE_URL', () => {
      const databaseUrl = configService.get('DATABASE_URL');
      expect(databaseUrl).toBe('postgresql://user:pass@localhost:5432/genfeed');
    });

    it('should return undefined for non-existent key', () => {
      const value = configService.get('NON_EXISTENT_KEY');
      expect(value).toBeUndefined();
    });
  });

  describe('environment checks', () => {
    it('should not be production or staging in test', () => {
      expect(configService.isDevelopment).toBe(false);
      expect(configService.isStaging).toBe(false);
      expect(configService.isProduction).toBe(false);
    });

    it('should enable schedulers outside local development', () => {
      expect(configService.isDevSchedulersEnabled).toBe(true);
    });

    it('should disable schedulers by default in development', () => {
      process.env.NODE_ENV = 'development';
      configService = new ConfigService();

      expect(configService.isDevSchedulersEnabled).toBe(false);
    });

    it('should allow opting into schedulers in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.GF_DEV_ENABLE_SCHEDULERS = 'true';
      configService = new ConfigService();

      expect(configService.isDevSchedulersEnabled).toBe(true);
    });
  });
});
