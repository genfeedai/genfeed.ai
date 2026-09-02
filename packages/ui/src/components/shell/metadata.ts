import type { PWAAppNameKey } from '@genfeedai/contracts/interfaces/pwa/pwa.interface';
import { generatePWAMetadata } from '@ui/pwa/pwa.helper';
import type { Metadata } from 'next';

export interface CreateAppMetadataOptions {
  description: string;
  metadataBase: string | URL;
  title: string;
  overrides?: Metadata;
  pwaMetadata?: Metadata;
}

/**
 * Connection hints are deliberately not emitted here. `<meta name="preconnect">`
 * is not a thing — only `<link rel="preconnect">` opens a socket — so the meta
 * form shipped bytes that no browser acted on while api/cdn origins still paid
 * full DNS+TLS on first use. `AppHtmlDocument` renders the real link tags; the
 * origin lists live in `resource-hints.ts`.
 */
export function createAppMetadata({
  description,
  metadataBase,
  title,
  overrides,
  pwaMetadata,
}: CreateAppMetadataOptions): Metadata {
  return {
    description,
    metadataBase:
      metadataBase instanceof URL ? metadataBase : new URL(metadataBase),
    title,
    ...pwaMetadata,
    ...overrides,
  };
}

export function createPwaMetadata(appName: PWAAppNameKey) {
  return generatePWAMetadata(appName);
}
