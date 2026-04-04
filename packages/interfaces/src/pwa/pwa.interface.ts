import type { Metadata, Viewport } from 'next';

/**
 * PWA display modes for web app manifest
 */
export type PWADisplayMode =
  | 'standalone'
  | 'fullscreen'
  | 'minimal-ui'
  | 'browser';

/**
 * PWA icon configuration for manifest
 */
export interface PWAIconConfig {
  src: string;
  sizes: string;
  type: string;
  purpose?: 'any' | 'maskable' | 'monochrome';
}

/**
 * PWA screenshot configuration for manifest (for app store listings)
 */
export interface PWAScreenshotConfig {
  src: string;
  sizes: string;
  type: string;
  form_factor?: 'wide' | 'narrow';
  label?: string;
}

/**
 * Full PWA manifest configuration
 */
export interface PWAManifestConfig {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: PWADisplayMode;
  background_color: string;
  theme_color: string;
  icons: PWAIconConfig[];
  screenshots?: PWAScreenshotConfig[];
}

/**
 * App-specific PWA configuration
 */
export interface PWAAppConfig {
  appName: PWAAppNameKey;
  displayName: string;
  shortName: string;
  description: string;
  themeColorLight: string;
  themeColorDark: string;
  backgroundColor: string;
  startUrl: string;
  scope: string;
}

/**
 * Union type of all PWA-enabled app names
 */
export type PWAAppNameKey =
  | 'app'
  | 'studio'
  | 'workflows'
  | 'manager'
  | 'publisher'
  | 'analytics'
  | 'automation'
  | 'dashboard'
  | 'settings'
  | 'marketplace';

/**
 * PWA metadata configuration for Next.js
 */
export interface PWAMetadataConfig {
  metadata: Metadata;
  viewport: Viewport;
}

/**
 * PWA configuration options for next.config
 */
export interface PWANextConfigOptions {
  enabled?: boolean;
  offlineFallbackPath?: string;
}
