import type {
  PWAAppConfig,
  PWAAppNameKey,
} from '@genfeedai/interfaces/pwa/pwa.interface';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies - inline the data in the factory to avoid TDZ hoisting issues
vi.mock('@ui-constants/pwa/pwa-apps.constant', () => ({
  PWA_APPS: {
    manager: {
      appId: 'manager',
      backgroundColor: '#1a1a1a',
      description: 'Content management platform',
      displayName: 'Genfeed Manager',
      scope: '/manager',
      shortName: 'Manager',
      startUrl: '/manager',
      themeColorDark: '#0a0a0a',
      themeColorLight: '#f5f5f5',
    } as PWAAppConfig,
    studio: {
      appId: 'studio',
      backgroundColor: '#000000',
      description: 'AI-powered content creation studio',
      displayName: 'Genfeed Studio',
      scope: '/studio',
      shortName: 'Studio',
      startUrl: '/studio',
      themeColorDark: '#1a1a1a',
      themeColorLight: '#ffffff',
    } as PWAAppConfig,
  } as Record<string, PWAAppConfig>,
}));

import {
  generatePWAManifest,
  generatePWAMetadata,
  getPWAConfig,
} from '@ui/pwa/pwa.helper';

describe('pwa.helper', () => {
  const originalCdnUrl = process.env.NEXT_PUBLIC_CDN_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.genfeed.ai';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalCdnUrl === undefined) {
      delete process.env.NEXT_PUBLIC_CDN_URL;
    } else {
      process.env.NEXT_PUBLIC_CDN_URL = originalCdnUrl;
    }
  });

  describe('getPWAConfig', () => {
    it('should return config for valid app', () => {
      const config = getPWAConfig('studio' as PWAAppNameKey);

      expect(config.displayName).toBe('Genfeed Studio');
      expect(config.shortName).toBe('Studio');
    });

    it('should return config for manager app', () => {
      const config = getPWAConfig('manager' as PWAAppNameKey);

      expect(config.displayName).toBe('Genfeed Manager');
    });

    it('should throw error for invalid app', () => {
      expect(() => getPWAConfig('invalid' as PWAAppNameKey)).toThrow(
        'PWA config not found for app: invalid',
      );
    });
  });

  describe('generatePWAManifest', () => {
    it('should generate manifest with correct properties', () => {
      const manifest = generatePWAManifest('studio' as PWAAppNameKey);

      expect(manifest.name).toBe('Genfeed Studio');
      expect(manifest.short_name).toBe('Studio');
      expect(manifest.description).toBe('AI-powered content creation studio');
      expect(manifest.background_color).toBe('#000000');
      expect(manifest.theme_color).toBe('#1a1a1a');
      expect(manifest.display).toBe('standalone');
    });

    it('should generate correct scope and start_url', () => {
      const manifest = generatePWAManifest('studio' as PWAAppNameKey);

      expect(manifest.scope).toBe('/studio');
      expect(manifest.start_url).toBe('/studio');
    });

    it('should generate icons with correct CDN URLs', () => {
      const manifest = generatePWAManifest('studio' as PWAAppNameKey);

      expect(manifest.icons).toHaveLength(4);
      expect(manifest.icons[0].src).toBe(
        'https://cdn.genfeed.ai/assets/pwa/studio/icon-192x192.png',
      );
      expect(manifest.icons[1].src).toBe(
        'https://cdn.genfeed.ai/assets/pwa/studio/icon-512x512.png',
      );
    });

    it('should include maskable icons', () => {
      const manifest = generatePWAManifest('studio' as PWAAppNameKey);

      const maskableIcons = manifest.icons.filter(
        (i) => i.purpose === 'maskable',
      );
      expect(maskableIcons).toHaveLength(2);
    });

    it('should include regular icons', () => {
      const manifest = generatePWAManifest('studio' as PWAAppNameKey);

      const anyIcons = manifest.icons.filter((i) => i.purpose === 'any');
      expect(anyIcons).toHaveLength(2);
    });

    it('should use correct sizes for icons', () => {
      const manifest = generatePWAManifest('studio' as PWAAppNameKey);

      const sizes = manifest.icons.map((i) => i.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
    });
  });

  describe('generatePWAMetadata', () => {
    it('should generate metadata with correct application name', () => {
      const { metadata } = generatePWAMetadata('studio' as PWAAppNameKey);

      expect(metadata.applicationName).toBe('Genfeed Studio');
    });

    it('should configure apple web app correctly', () => {
      const { metadata } = generatePWAMetadata('studio' as PWAAppNameKey);

      expect(metadata.appleWebApp).toEqual({
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Studio',
      });
    });

    it('should disable telephone detection', () => {
      const { metadata } = generatePWAMetadata('studio' as PWAAppNameKey);

      expect(metadata.formatDetection).toEqual({ telephone: false });
    });

    it('should configure manifest path', () => {
      const { metadata } = generatePWAMetadata('studio' as PWAAppNameKey);

      expect(metadata.manifest).toBe('/manifest.webmanifest');
    });

    it('should generate apple touch icon', () => {
      const { metadata } = generatePWAMetadata('studio' as PWAAppNameKey);

      expect(metadata.icons?.apple).toEqual([
        {
          sizes: '180x180',
          url: 'https://cdn.genfeed.ai/assets/pwa/studio/apple-touch-icon.png',
        },
      ]);
    });

    it('should generate favicon icons', () => {
      const { metadata } = generatePWAMetadata('studio' as PWAAppNameKey);

      expect(metadata.icons?.icon).toHaveLength(3);
      expect(metadata.icons?.icon?.[0]).toEqual({
        rel: 'icon',
        type: 'image/x-icon',
        url: '/favicon.ico',
      });
      expect(metadata.icons?.icon?.[1]).toEqual({
        sizes: '192x192',
        type: 'image/png',
        url: 'https://cdn.genfeed.ai/assets/pwa/studio/icon-192x192.png',
      });
    });

    it('should generate viewport config', () => {
      const { viewport } = generatePWAMetadata('studio' as PWAAppNameKey);

      expect(viewport.width).toBe('device-width');
      expect(viewport.initialScale).toBe(1);
      expect(viewport.maximumScale).toBe(1);
      expect(viewport.userScalable).toBe(false);
      expect(viewport.viewportFit).toBe('cover');
    });

    it('should configure theme colors for light and dark modes', () => {
      const { viewport } = generatePWAMetadata('studio' as PWAAppNameKey);

      expect(viewport.themeColor).toEqual([
        { color: '#ffffff', media: '(prefers-color-scheme: light)' },
        { color: '#1a1a1a', media: '(prefers-color-scheme: dark)' },
      ]);
    });
  });
});
