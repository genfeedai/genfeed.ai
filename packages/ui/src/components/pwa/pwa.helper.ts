import type {
  PWAAppConfig,
  PWAAppNameKey,
  PWAManifestConfig,
  PWAMetadataConfig,
} from '@genfeedai/interfaces/pwa/pwa.interface';
import { PWA_APPS } from '@ui-constants/pwa/pwa-apps.constant';
import type { Metadata, Viewport } from 'next';

const DEFAULT_CDN_URL = 'https://cdn.genfeed.ai';

const getCdnUrl = () => process.env.NEXT_PUBLIC_CDN_URL || DEFAULT_CDN_URL;

export function getPWAConfig(appName: PWAAppNameKey): PWAAppConfig {
  const config = PWA_APPS[appName];
  if (!config) {
    throw new Error(`PWA config not found for app: ${appName}`);
  }
  return config;
}

export function generatePWAManifest(appName: PWAAppNameKey): PWAManifestConfig {
  const config = getPWAConfig(appName);
  const cdnUrl = getCdnUrl();

  return {
    background_color: config.backgroundColor,
    description: config.description,
    display: 'standalone',
    icons: [
      {
        purpose: 'any',
        sizes: '192x192',
        src: `${cdnUrl}/assets/pwa/${appName}/icon-192x192.png`,
        type: 'image/png',
      },
      {
        purpose: 'any',
        sizes: '512x512',
        src: `${cdnUrl}/assets/pwa/${appName}/icon-512x512.png`,
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '192x192',
        src: `${cdnUrl}/assets/pwa/${appName}/icon-maskable-192x192.png`,
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        src: `${cdnUrl}/assets/pwa/${appName}/icon-maskable-512x512.png`,
        type: 'image/png',
      },
    ],
    name: config.displayName,
    scope: config.scope,
    short_name: config.shortName,
    start_url: config.startUrl,
    theme_color: config.themeColorDark,
  };
}

export function generatePWAMetadata(appName: PWAAppNameKey): PWAMetadataConfig {
  const config = getPWAConfig(appName);
  const cdnUrl = getCdnUrl();

  const metadata: Metadata = {
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: config.shortName,
    },
    applicationName: config.displayName,
    formatDetection: {
      telephone: false,
    },
    icons: {
      apple: [
        {
          sizes: '180x180',
          url: `${cdnUrl}/assets/pwa/${appName}/apple-touch-icon.png`,
        },
      ],
      icon: [
        {
          rel: 'icon',
          type: 'image/x-icon',
          url: '/favicon.ico',
        },
        {
          sizes: '192x192',
          type: 'image/png',
          url: `${cdnUrl}/assets/pwa/${appName}/icon-192x192.png`,
        },
        {
          sizes: '512x512',
          type: 'image/png',
          url: `${cdnUrl}/assets/pwa/${appName}/icon-512x512.png`,
        },
      ],
      shortcut: '/favicon.ico',
    },
    manifest: '/manifest.webmanifest',
  };

  const viewport: Viewport = {
    initialScale: 1,
    maximumScale: 1,
    themeColor: [
      { color: config.themeColorLight, media: '(prefers-color-scheme: light)' },
      { color: config.themeColorDark, media: '(prefers-color-scheme: dark)' },
    ],
    userScalable: false,
    viewportFit: 'cover',
    width: 'device-width',
  };

  return { metadata, viewport };
}
