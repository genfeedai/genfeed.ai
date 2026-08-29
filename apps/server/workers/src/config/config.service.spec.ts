import process from 'node:process';
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
    delete process.env.QUEUE_HEALTH_ALERT_THROTTLE_MINUTES;
    delete process.env.QUEUE_HEALTH_ALERT_WEBHOOK_URL;
    delete process.env.QUEUE_HEALTH_MAX_FAILED;
    delete process.env.QUEUE_HEALTH_MAX_OLDEST_WAITING_MINUTES;
    delete process.env.QUEUE_HEALTH_MAX_WAITING;

    configService = new ConfigService();
  });

  afterEach(() => {
    delete process.env.GF_DEV_ENABLE_SCHEDULERS;
    delete process.env.DATABASE_URL;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.GENFEEDAI_CDN_URL;
    delete process.env.GENFEEDAI_APP_URL;
    delete process.env.GENFEEDAI_WEBHOOKS_URL;
    delete process.env.GENFEEDAI_MICROSERVICES_FILES_URL;
    delete process.env.QUEUE_HEALTH_ALERT_THROTTLE_MINUTES;
    delete process.env.QUEUE_HEALTH_ALERT_WEBHOOK_URL;
    delete process.env.QUEUE_HEALTH_MAX_FAILED;
    delete process.env.QUEUE_HEALTH_MAX_OLDEST_WAITING_MINUTES;
    delete process.env.QUEUE_HEALTH_MAX_WAITING;
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

  describe('ingredientsEndpoint', () => {
    // GENFEEDAI_CDN_URL is now part of workers' schema (#484): the getter
    // consumes it, so it is validated at startup instead of silently passing
    // through whatever (or nothing) is in the environment.
    it('builds the endpoint from the validated GENFEEDAI_CDN_URL', () => {
      process.env.GENFEEDAI_CDN_URL = 'https://cdn.example.com';
      configService = new ConfigService();

      expect(configService.ingredientsEndpoint).toBe(
        'https://cdn.example.com/ingredients',
      );
    });
  });

  describe('queue health monitoring', () => {
    it('provides validated defaults', () => {
      expect(configService.queueHealthMaxWaiting).toBe(100);
      expect(configService.queueHealthMaxOldestWaitingAgeSeconds).toBe(900);
      expect(configService.queueHealthMaxFailed).toBe(25);
      expect(configService.queueHealthAlertThrottleMs).toBe(3_600_000);
      expect(configService.queueHealthAlertWebhookUrl).toBeUndefined();
    });

    it('accepts explicit thresholds and an HTTPS alert webhook', () => {
      process.env.QUEUE_HEALTH_MAX_WAITING = '10';
      process.env.QUEUE_HEALTH_MAX_OLDEST_WAITING_MINUTES = '5';
      process.env.QUEUE_HEALTH_MAX_FAILED = '2';
      process.env.QUEUE_HEALTH_ALERT_THROTTLE_MINUTES = '30';
      process.env.QUEUE_HEALTH_ALERT_WEBHOOK_URL =
        'https://hooks.example.com/queue-health';

      configService = new ConfigService();

      expect(configService.queueHealthMaxWaiting).toBe(10);
      expect(configService.queueHealthMaxOldestWaitingAgeSeconds).toBe(300);
      expect(configService.queueHealthMaxFailed).toBe(2);
      expect(configService.queueHealthAlertThrottleMs).toBe(1_800_000);
      expect(configService.queueHealthAlertWebhookUrl).toBe(
        'https://hooks.example.com/queue-health',
      );
    });

    it.each([
      ['QUEUE_HEALTH_MAX_WAITING', '-1'],
      ['QUEUE_HEALTH_MAX_OLDEST_WAITING_MINUTES', '-1'],
      ['QUEUE_HEALTH_MAX_FAILED', '-1'],
      ['QUEUE_HEALTH_ALERT_THROTTLE_MINUTES', '0'],
      ['QUEUE_HEALTH_ALERT_WEBHOOK_URL', 'http://hooks.example.com/insecure'],
    ])('rejects invalid %s', (key, value) => {
      process.env[key] = value;

      expect(() => new ConfigService()).toThrow(new RegExp(key));

      delete process.env[key];
    });
  });

  describe('consumed env-var validation (#484)', () => {
    // The workers service consumes these genfeed URLs (ingredientsEndpoint,
    // the workspace-task webhook fallback, and the trend-summary cron) but
    // previously validated none of them, so a malformed value silently
    // produced a broken URL in production. They are validated here as
    // optional-but-well-formed: absence is tolerated (self-hosted/poll
    // fallbacks handle it), a malformed value fails fast at boot.
    it('rejects a malformed GENFEEDAI_CDN_URL at startup', () => {
      process.env.GENFEEDAI_CDN_URL = 'not-a-url';

      expect(() => new ConfigService()).toThrow(/GENFEEDAI_CDN_URL/);
    });

    it('rejects a malformed GENFEEDAI_WEBHOOKS_URL at startup', () => {
      process.env.GENFEEDAI_WEBHOOKS_URL = 'not-a-url';

      expect(() => new ConfigService()).toThrow(/GENFEEDAI_WEBHOOKS_URL/);
    });

    it('rejects a malformed GENFEEDAI_APP_URL at startup', () => {
      process.env.GENFEEDAI_APP_URL = 'not-a-url';

      expect(() => new ConfigService()).toThrow(/GENFEEDAI_APP_URL/);
    });

    it('tolerates absent consumed URL vars (optional in self-hosted)', () => {
      delete process.env.GENFEEDAI_CDN_URL;
      delete process.env.GENFEEDAI_APP_URL;
      delete process.env.GENFEEDAI_WEBHOOKS_URL;

      expect(() => new ConfigService()).not.toThrow();
    });

    it('defaults GENFEEDAI_MICROSERVICES_FILES_URL to localhost in self-hosted', () => {
      delete process.env.GENFEEDAI_MICROSERVICES_FILES_URL;
      configService = new ConfigService();

      expect(configService.get('GENFEEDAI_MICROSERVICES_FILES_URL')).toBe(
        'http://localhost:3012',
      );
    });
  });

  describe('consumed env-var schema coverage (#484)', () => {
    // Every env var the workers service reads via configService.get() must be
    // part of its validation schema so misconfiguration is visible and the
    // schema is the single source of truth (no silent passthrough).
    const consumedKeys = [
      'OPENROUTER_API_KEY', // clip analysis/factory workflow actions
      'REPLICATE_KEY', // model-watcher cron + model-discovery service
      'AWS_REGION', // llm-idle cron EC2Client
      'AWS_ACCESS_KEY_ID', // llm-idle cron EC2Client
      'AWS_SECRET_ACCESS_KEY', // llm-idle cron EC2Client
      'GPU_LLM_INSTANCE_ID', // llm-idle cron
      'SERVICE_NAME', // health-response label
    ] as const;

    it.each(consumedKeys)('validates %s', (key) => {
      expect(ConfigService.schema.describe().keys).toHaveProperty(key);
    });

    it('keeps the new consumed vars optional (absent does not throw)', () => {
      const previous: Record<string, string | undefined> = {};
      for (const key of consumedKeys) {
        previous[key] = process.env[key];
        delete process.env[key];
      }

      try {
        expect(() => new ConfigService()).not.toThrow();
      } finally {
        for (const key of consumedKeys) {
          if (previous[key] === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = previous[key];
          }
        }
      }
    });

    it('does not inject an AWS_REGION default (cron fallback preserved)', () => {
      delete process.env.AWS_REGION;
      configService = new ConfigService();

      expect(configService.get('AWS_REGION')).toBeUndefined();
    });

    it('flows a provided REPLICATE_KEY through the validated config', () => {
      process.env.REPLICATE_KEY = 'r8_test_key';
      configService = new ConfigService();

      expect(configService.get('REPLICATE_KEY')).toBe('r8_test_key');

      delete process.env.REPLICATE_KEY;
    });
  });
});
