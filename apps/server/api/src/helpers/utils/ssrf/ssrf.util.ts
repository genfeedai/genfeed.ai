import { BadRequestException } from '@nestjs/common';

/**
 * Hostnames that must never be fetched server-side, regardless of range
 * checks (cloud metadata endpoints, loopback aliases).
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::]',
  '[::1]',
  'metadata.google.internal',
  'metadata.google',
  'instance-data',
]);

/**
 * Validate a hostname against SSRF targets: loopback, RFC-1918 private
 * ranges, link-local/cloud-metadata (169.254.0.0/16), and internal TLDs.
 * Throws BadRequestException on a blocked host.
 *
 * Single source of truth for server-side URL fetching (brand scraper,
 * Mastodon instance discovery, ...). Extracted from MastodonService.
 */
export function assertHostNotPrivate(hostname: string): void {
  const lowerHost = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(lowerHost)) {
    throw new BadRequestException('URL points to a blocked address');
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(
    lowerHost,
  );
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (
      a === 10 || // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254) || // 169.254.0.0/16 (link-local / cloud metadata)
      a === 127 || // 127.0.0.0/8
      a === 0 // 0.0.0.0/8
    ) {
      throw new BadRequestException('URL points to a private IP range');
    }
  }

  if (lowerHost.endsWith('.internal') || lowerHost.endsWith('.local')) {
    throw new BadRequestException('URL points to an internal hostname');
  }
}

/**
 * Parse a URL and validate its hostname. Throws BadRequestException for
 * unparseable URLs or SSRF targets.
 */
export function assertUrlNotPrivate(url: string): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Invalid URL');
  }

  assertHostNotPrivate(parsed.hostname);
}
