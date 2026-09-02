import { isIP } from 'node:net';
import { assertHostNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';

const LOGO_DEV_IMAGE_ORIGIN = 'https://img.logo.dev';
const LOGO_DEV_IMAGE_SIZE = '128';
const RESERVED_DOMAIN_SUFFIXES = [
  '.alt',
  '.arpa',
  '.example',
  '.internal',
  '.invalid',
  '.local',
  '.localhost',
  '.onion',
  '.test',
] as const;

function isValidDomainLabel(label: string): boolean {
  return (
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}

/**
 * Reduce a public website URL to the hostname that Logo.dev is allowed to see.
 * Paths, query strings, ports, and URL credentials are deliberately discarded.
 */
export function normalizePublicWebsiteDomain(
  sourceUrl: string,
): string | undefined {
  try {
    const parsed = new URL(sourceUrl);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return undefined;
    }

    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^www\./, '');

    if (
      hostname.length === 0 ||
      hostname.length > 253 ||
      !hostname.includes('.') ||
      isIP(hostname) !== 0 ||
      RESERVED_DOMAIN_SUFFIXES.some(
        (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
      ) ||
      !hostname.split('.').every(isValidDomainLabel)
    ) {
      return undefined;
    }

    assertHostNotPrivate(hostname);
    return hostname;
  } catch {
    return undefined;
  }
}

/**
 * Build a non-blocking Logo.dev Image API fallback.
 *
 * Only publishable `pk_` keys are accepted because the resulting URL can be
 * serialized to clients. Missing/malformed credentials and non-public domains
 * disable the provider and leave the existing placeholder path intact.
 */
export function buildLogoDevLogoUrl(
  sourceUrl: string,
  publishableKey?: string,
): string | undefined {
  const token = publishableKey?.trim();
  if (!token?.startsWith('pk_')) {
    return undefined;
  }

  const domain = normalizePublicWebsiteDomain(sourceUrl);
  if (!domain) {
    return undefined;
  }

  const logoUrl = new URL(`/${domain}`, LOGO_DEV_IMAGE_ORIGIN);
  logoUrl.searchParams.set('token', token);
  logoUrl.searchParams.set('size', LOGO_DEV_IMAGE_SIZE);
  logoUrl.searchParams.set('format', 'png');
  logoUrl.searchParams.set('fallback', 'monogram');

  return logoUrl.href;
}
