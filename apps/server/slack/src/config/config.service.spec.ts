import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/config/default.config', () => {
  class DefaultConfigService {
    private env: Record<string, string | undefined> = {};

    setEnv(key: string, value: string | undefined) {
      this.env[key] = value;
    }

    get(key: string): string | undefined {
      return this.env[key];
    }
  }
  return { getDefaultConfigService: () => DefaultConfigService };
});

import { ConfigService } from '@slack/config/config.service';

describe('ConfigService (slack)', () => {
  let service: ConfigService;

  beforeEach(() => {
    service = new ConfigService();
  });

  describe('API_URL', () => {
    it('should return GENFEEDAI_API_URL when set', () => {
      (service as any).setEnv('GENFEEDAI_API_URL', 'https://api.example.com');
      expect(service.API_URL).toBe('https://api.example.com');
    });

    it('should return default localhost URL when env var is not set', () => {
      (service as any).setEnv('GENFEEDAI_API_URL', undefined);
      expect(service.API_URL).toBe('http://localhost:3010');
    });

    it('should return default when env var is empty string', () => {
      (service as any).setEnv('GENFEEDAI_API_URL', '');
      expect(service.API_URL).toBe('http://localhost:3010');
    });

    it('should reflect updated env value', () => {
      (service as any).setEnv(
        'GENFEEDAI_API_URL',
        'https://staging.genfeed.ai',
      );
      expect(service.API_URL).toBe('https://staging.genfeed.ai');
    });
  });

  describe('API_KEY', () => {
    it('should return GENFEEDAI_API_KEY when set', () => {
      (service as any).setEnv('GENFEEDAI_API_KEY', 'secret-api-key-xyz');
      expect(service.API_KEY).toBe('secret-api-key-xyz');
    });

    it('should return empty string when env var is not set', () => {
      (service as any).setEnv('GENFEEDAI_API_KEY', undefined);
      expect(service.API_KEY).toBe('');
    });

    it('should return empty string when env var is empty string', () => {
      (service as any).setEnv('GENFEEDAI_API_KEY', '');
      expect(service.API_KEY).toBe('');
    });

    it('should support keys with special characters', () => {
      (service as any).setEnv('GENFEEDAI_API_KEY', 'sk-test_ABC-123.xyz');
      expect(service.API_KEY).toBe('sk-test_ABC-123.xyz');
    });
  });

  it('should be instantiable as a class', () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ConfigService);
  });
});
