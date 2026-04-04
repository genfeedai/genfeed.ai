import { EnvironmentService } from '@services/core/environment.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('EnvironmentService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
  });

  describe('environment detection', () => {
    it('detects development environment', () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(EnvironmentService.isDevelopment).toBe(true);
      expect(EnvironmentService.isProduction).toBe(false);
      expect(EnvironmentService.isTest).toBe(false);
    });

    it('detects production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(EnvironmentService.isDevelopment).toBe(false);
      expect(EnvironmentService.isProduction).toBe(true);
      expect(EnvironmentService.isTest).toBe(false);
    });

    it('detects test environment', () => {
      vi.stubEnv('NODE_ENV', 'test');
      expect(EnvironmentService.isDevelopment).toBe(false);
      expect(EnvironmentService.isProduction).toBe(false);
      expect(EnvironmentService.isTest).toBe(true);
    });
  });

  describe('API endpoints', () => {
    it('returns default API endpoint when NEXT_PUBLIC_API_ENDPOINT is not set', () => {
      delete process.env.NEXT_PUBLIC_API_ENDPOINT;

      expect(EnvironmentService.apiEndpoint).toBe('https://api.genfeed.ai/v1');
    });

    it('returns custom API endpoint when NEXT_PUBLIC_API_ENDPOINT is set', () => {
      process.env.NEXT_PUBLIC_API_ENDPOINT = 'http://custom-api.example.com';

      expect(EnvironmentService.apiEndpoint).toBe(
        'http://custom-api.example.com',
      );
    });
  });

  describe('WebSocket endpoints', () => {
    it('returns default WS endpoint when NEXT_PUBLIC_WS_ENDPOINT is not set', () => {
      delete process.env.NEXT_PUBLIC_WS_ENDPOINT;

      expect(EnvironmentService.wsEndpoint).toBe(
        'https://notifications.genfeed.ai',
      );
    });

    it('returns custom WS endpoint when NEXT_PUBLIC_WS_ENDPOINT is set', () => {
      process.env.NEXT_PUBLIC_WS_ENDPOINT = 'http://custom-ws.example.com';

      expect(EnvironmentService.wsEndpoint).toBe(
        'http://custom-ws.example.com',
      );
    });
  });

  describe('CDN URL', () => {
    it('returns default CDN URL when NEXT_PUBLIC_CDN_URL is not set', () => {
      delete process.env.NEXT_PUBLIC_CDN_URL;

      expect(EnvironmentService.cdnUrl).toBe('https://cdn.genfeed.ai');
    });

    it('returns custom CDN URL when NEXT_PUBLIC_CDN_URL is set', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'http://custom-cdn.example.com';

      expect(EnvironmentService.cdnUrl).toBe('http://custom-cdn.example.com');
    });
  });

  describe('App endpoints', () => {
    it('returns default app endpoints when env vars not set', () => {
      expect(EnvironmentService.apps.admin).toBe('https://admin.genfeed.ai');
      expect(EnvironmentService.apps.app).toBe('https://app.genfeed.ai');
      expect(EnvironmentService.apps.marketplace).toBe(
        'https://marketplace.genfeed.ai',
      );
      expect(EnvironmentService.apps.website).toBe('https://genfeed.ai');
    });

    // Note: App endpoints are initialized at module load time, so dynamic testing
    // of environment variable changes isn't possible without module reloading
  });

  describe('currentApp', () => {
    it('detects marketplace on local port 3104', () => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          hostname: 'local.genfeed.ai',
          port: '3104',
        },
      });

      expect(EnvironmentService.currentApp).toBe('marketplace');
    });

    it('detects website on local port 3105', () => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          hostname: 'local.genfeed.ai',
          port: '3105',
        },
      });

      expect(EnvironmentService.currentApp).toBe('website');
    });
  });

  describe('Logo URL', () => {
    it('returns correct logo URL', () => {
      const assetsEndpoint = EnvironmentService.assetsEndpoint;

      expect(EnvironmentService.logoURL).toBe(
        `${assetsEndpoint}/branding/logo.svg`,
      );
    });
  });

  describe('Constants', () => {
    it('has correct default values', () => {
      expect(EnvironmentService.CREDITS_LABEL).toBe('GEN');
      expect(EnvironmentService.CREDITS_TRAINING_COST).toBe(500);
      expect(EnvironmentService.LOGO_ALT).toBe('Genfeed.ai');
    });

    // Note: GA ID is initialized at module load time, so dynamic testing
    // of environment variable changes isn't possible without module reloading
  });

  describe('Plans', () => {
    // Note: Plans are initialized at module load time, so dynamic testing
    // of environment variable changes isn't possible without module reloading
    it('has plans object structure', () => {
      expect(EnvironmentService.plans).toBeDefined();
      expect(typeof EnvironmentService.plans).toBe('object');
    });
  });
});
