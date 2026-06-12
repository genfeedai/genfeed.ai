import type {
  PWAAppConfig,
  PWAAppNameKey,
  PWAManifestConfig,
  PWAMetadataConfig,
} from '@genfeedai/interfaces/pwa/pwa.interface';
import { PWA_APPS } from '@ui-constants/pwa/pwa-apps.constant';
import type { Metadata, Viewport } from 'next';

const DEFAULT_CDN_URL = 'https://cdn.genfeed.ai';
const LOCAL_PWA_ASSET_APPS = new Set<PWAAppNameKey>(['app']);

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const getCdnUrl = () =>
  withoutTrailingSlash(process.env.NEXT_PUBLIC_CDN_URL || DEFAULT_CDN_URL);

const getPWAAssetUrl = (appName: PWAAppNameKey, fileName: string) => {
  const explicitAssetBaseUrl = process.env.NEXT_PUBLIC_PWA_ASSET_BASE_URL;
  if (explicitAssetBaseUrl) {
    return `${withoutTrailingSlash(explicitAssetBaseUrl)}/assets/pwa/${appName}/${fileName}`;
  }

  if (LOCAL_PWA_ASSET_APPS.has(appName)) {
    return `/assets/pwa/${appName}/${fileName}`;
  }

  return `${getCdnUrl()}/assets/pwa/${appName}/${fileName}`;
};

export function getPWAConfig(appName: PWAAppNameKey): PWAAppConfig {
  const config = PWA_APPS[appName];
  if (!config) {
    throw new Error(`PWA config not found for app: ${appName}`);
  }
  return config;
}

export function generatePWAManifest(appName: PWAAppNameKey): PWAManifestConfig {
  const config = getPWAConfig(appName);

  return {
    background_color: config.backgroundColor,
    description: config.description,
    display: 'standalone',
    icons: [
      {
        purpose: 'any',
        sizes: '192x192',
        src: getPWAAssetUrl(appName, 'icon-192x192.png'),
        type: 'image/png',
      },
      {
        purpose: 'any',
        sizes: '512x512',
        src: getPWAAssetUrl(appName, 'icon-512x512.png'),
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '192x192',
        src: getPWAAssetUrl(appName, 'icon-maskable-192x192.png'),
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        src: getPWAAssetUrl(appName, 'icon-maskable-512x512.png'),
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
          url: getPWAAssetUrl(appName, 'apple-touch-icon.png'),
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
          url: getPWAAssetUrl(appName, 'icon-192x192.png'),
        },
        {
          sizes: '512x512',
          type: 'image/png',
          url: getPWAAssetUrl(appName, 'icon-512x512.png'),
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
