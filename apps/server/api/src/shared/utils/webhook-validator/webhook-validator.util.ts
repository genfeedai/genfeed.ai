import * as dns from 'node:dns/promises';
import { Agent as HttpsAgent } from 'node:https';
import * as net from 'node:net';
import { BadRequestException } from '@nestjs/common';

/**
 * SSRF-safe URL validation for user-supplied webhook URLs.
 *
 * Blocks:
 *  - Non-HTTPS schemes
 *  - RFC 1918 private ranges: 10/8, 172.16/12, 192.168/16
 *  - Loopback: 127/8, ::1
 *  - Link-local (AWS metadata): 169.254/16, fe80::/10
 *  - Unspecified: 0/8
 *  - ULA IPv6: fc00::/7
 *  - Multicast: 224/4, ff00::/8
 */

/** Blocked header names (lowercase) that can be used for header injection or credential leakage. */
export const BLOCKED_WEBHOOK_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'authorization',
  'cookie',
  'set-cookie',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'via',
  'forwarded',
]);

/**
 * Checks whether an IPv4 address string falls inside a private/reserved CIDR.
 * Returns true if the address is blocked.
 */
function isBlockedIpv4(addr: string): boolean {
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    // Not a parseable dotted-decimal — treat as blocked to be safe.
    return true;
  }

  const [a, b] = parts;

  // 0.0.0.0/8 — "this" network
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local / AWS metadata endpoint
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 224.0.0.0/4 — multicast
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 — reserved
  if (a >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address string (without brackets) falls inside a
 * private/reserved range. Returns true if the address is blocked.
 */
function isBlockedIpv6(addr: string): boolean {
  // ::1 — loopback
  if (addr === '::1') return true;

  const lower = addr.toLowerCase();

  // fe80::/10 — link-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;

  // fc00::/7 — ULA (fc and fd prefixes)
  if (/^f[cd]/.test(lower)) return true;

  // ff00::/8 — multicast
  if (/^ff/.test(lower)) return true;

  // ::ffff:0:0/96 — IPv4-mapped
  if (lower.startsWith('::ffff:')) {
    const ipv4Part = lower.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return isBlockedIpv4(ipv4Part);
    }
  }

  return false;
}

function isBlockedAddress(address: string, family: 4 | 6): boolean {
  if (family === 4) {
    return isBlockedIpv4(address);
  }
  return isBlockedIpv6(address);
}

interface SafeWebhookResolution {
  address: string;
  family: 4 | 6;
  hostname: string;
}

async function resolveSafeWebhookUrl(
  url: string,
): Promise<SafeWebhookResolution> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('webhookUrl is not a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException(
      'webhookUrl must use HTTPS — HTTP endpoints are not permitted',
    );
  }

  const hostname = parsed.hostname;

  if (net.isIPv4(hostname)) {
    if (isBlockedIpv4(hostname)) {
      throw new BadRequestException(
        'webhookUrl resolves to a private or reserved IP address',
      );
    }
    return { address: hostname, family: 4, hostname };
  }

  const bareIpv6 = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;

  if (net.isIPv6(bareIpv6)) {
    if (isBlockedIpv6(bareIpv6)) {
      throw new BadRequestException(
        'webhookUrl resolves to a private or reserved IP address',
      );
    }
    return { address: bareIpv6, family: 6, hostname };
  }

  let records: dns.LookupAddress[];

  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new BadRequestException(
      'webhookUrl hostname could not be resolved — please provide a valid public endpoint',
    );
  }

  if (records.length === 0) {
    throw new BadRequestException(
      'webhookUrl hostname could not be resolved — please provide a valid public endpoint',
    );
  }

  for (const record of records) {
    const family = record.family as 4 | 6;
    if (isBlockedAddress(record.address, family)) {
      throw new BadRequestException(
        'webhookUrl resolves to a private or reserved IP address',
      );
    }
  }

  const firstRecord = records[0];
  if (!firstRecord) {
    throw new BadRequestException(
      'webhookUrl hostname could not be resolved — please provide a valid public endpoint',
    );
  }

  return {
    address: firstRecord.address,
    family: firstRecord.family as 4 | 6,
    hostname,
  };
}

/**
 * Validates a user-supplied webhook URL for SSRF safety.
 *
 * - Requires HTTPS scheme.
 * - Resolves the hostname via DNS and blocks private/reserved IP ranges.
 * - Throws `BadRequestException` with a descriptive message on failure.
 */
export async function assertSafeWebhookUrl(url: string): Promise<void> {
  await resolveSafeWebhookUrl(url);
}

export async function createSafeWebhookHttpsAgent(
  url: string,
): Promise<HttpsAgent> {
  const resolution = await resolveSafeWebhookUrl(url);

  return new HttpsAgent({
    lookup: (hostname, _options, callback) => {
      if (hostname === resolution.hostname) {
        callback(null, resolution.address, resolution.family);
        return;
      }

      callback(new Error('Unsafe webhook redirect hostname rejected'));
    },
  });
}

/**
 * Validates user-supplied webhook headers and strips or rejects forbidden ones.
 *
 * Blocks headers that could be used for host spoofing, credential injection,
 * or proxy bypass. Returns the sanitised subset that is safe to forward.
 *
 * Throws `BadRequestException` if a blocked header is present.
 */
export function assertSafeWebhookHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  for (const key of Object.keys(headers)) {
    if (BLOCKED_WEBHOOK_HEADERS.has(key.toLowerCase())) {
      throw new BadRequestException(
        `webhookHeaders must not contain the '${key}' header`,
      );
    }

    if (/[\r\n]/.test(key) || /[\r\n]/.test(headers[key])) {
      throw new BadRequestException(
        `webhookHeaders contains an invalid header value with line-break characters`,
      );
    }
  }

  return headers;
}
