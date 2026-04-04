import type { PWAAppNameKey } from '@genfeedai/interfaces/pwa/pwa.interface';
import { generatePWAMetadata } from '@ui/pwa/pwa.helper';
import type { Metadata } from 'next';

const DEFAULT_DNS_PREFETCH = [
  'https://clerk.genfeed.ai',
  'https://www.googletagmanager.com',
];
const DEFAULT_PRECONNECT = [
  'https://api.genfeed.ai',
  'https://cdn.genfeed.ai',
  'https://notifications.genfeed.ai',
];

export interface CreateAppMetadataOptions {
  description: string;
  metadataBase: string | URL;
  title: string;
  dnsPrefetch?: string[];
  preconnect?: string[];
  overrides?: Metadata;
  pwaMetadata?: Metadata;
}

export function createAppMetadata({
  description,
  metadataBase,
  title,
  dnsPrefetch = DEFAULT_DNS_PREFETCH,
  preconnect = DEFAULT_PRECONNECT,
  overrides,
  pwaMetadata,
}: CreateAppMetadataOptions): Metadata {
  const mergedOtherEntries = Object.entries(overrides?.other ?? {}).filter(
    ([, value]) => value !== undefined,
  );

  return {
    description,
    metadataBase:
      metadataBase instanceof URL ? metadataBase : new URL(metadataBase),
    other: Object.fromEntries([
      ['dns-prefetch', dnsPrefetch.join(',')],
      ['preconnect', preconnect.join(',')],
      ...mergedOtherEntries,
    ]) as NonNullable<Metadata['other']>,
    title,
    ...pwaMetadata,
    ...overrides,
  };
}

export function createPwaMetadata(appName: PWAAppNameKey) {
  return generatePWAMetadata(appName);
}
