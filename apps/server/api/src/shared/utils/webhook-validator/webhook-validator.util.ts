import { Agent as HttpsAgent } from 'node:https';
import {
  DestinationGuardError,
  resolveSafeDestination,
} from '@libs/security/destination-guard';
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

  try {
    const destination = await resolveSafeDestination(parsed, {
      allowedSchemes: ['https:'],
    });
    return {
      address: destination.address,
      family: destination.family,
      hostname: destination.url.hostname,
    };
  } catch (error: unknown) {
    if (error instanceof DestinationGuardError) {
      throw new BadRequestException(
        'webhookUrl must target a public address without credentials; private or reserved IP addresses are not permitted',
      );
    }
    throw new BadRequestException(
      'webhookUrl hostname could not be resolved — please provide a valid public endpoint',
    );
  }
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
    lookup: (hostname, options, callback) => {
      if (hostname === resolution.hostname) {
        if (options.all) {
          callback(null, [
            { address: resolution.address, family: resolution.family },
          ]);
          return;
        }
        callback(null, resolution.address, resolution.family);
        return;
      }

      callback(
        new Error('Unsafe webhook redirect hostname rejected'),
        options.all ? [] : '',
        4,
      );
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
