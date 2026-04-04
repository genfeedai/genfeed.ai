import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@slack/config/config.service';

describe('Slack ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  describe('service', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should be an instance of ConfigService', () => {
      expect(service).toBeInstanceOf(ConfigService);
    });
  });

  describe('API_URL', () => {
    it('should return default API URL when env var is not set', () => {
      const original = process.env.GENFEEDAI_API_URL;
      delete process.env.GENFEEDAI_API_URL;

      const result = service.API_URL;

      expect(result).toBe('http://localhost:3001');

      if (original !== undefined) {
        process.env.GENFEEDAI_API_URL = original;
      }
    });

    it('should return configured API URL from env var', () => {
      process.env.GENFEEDAI_API_URL = 'https://api.slack-test.com';

      const result = service.API_URL;

      expect(result).toBe('https://api.slack-test.com');

      delete process.env.GENFEEDAI_API_URL;
    });

    it('should return a string type', () => {
      const result = service.API_URL;
      expect(typeof result).toBe('string');
    });
  });

  describe('API_KEY', () => {
    it('should return empty string when env var is not set', () => {
      const original = process.env.GENFEEDAI_API_KEY;
      delete process.env.GENFEEDAI_API_KEY;

      const result = service.API_KEY;

      expect(result).toBe('');

      if (original !== undefined) {
        process.env.GENFEEDAI_API_KEY = original;
      }
    });

    it('should return configured API key from env var', () => {
      process.env.GENFEEDAI_API_KEY = 'slack-api-key-xyz';

      const result = service.API_KEY;

      expect(result).toBe('slack-api-key-xyz');

      delete process.env.GENFEEDAI_API_KEY;
    });

    it('should return a string type', () => {
      const result = service.API_KEY;
      expect(typeof result).toBe('string');
    });

    it('should not expose secrets in non-string format', () => {
      process.env.GENFEEDAI_API_KEY = 'secret-key';

      const result = service.API_KEY;

      expect(typeof result).toBe('string');
      expect(result).not.toBeNull();

      delete process.env.GENFEEDAI_API_KEY;
    });
  });
});
