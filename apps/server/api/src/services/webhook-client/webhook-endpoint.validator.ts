import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['localhost']);

export class WebhookEndpointValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookEndpointValidationError';
  }
}

function isBlockedIPv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isBlockedIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}

function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isBlockedIPv4(address);
  if (version === 6) return isBlockedIPv6(address);
  return true;
}

export async function assertSafeWebhookEndpoint(
  endpoint: string,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new WebhookEndpointValidationError(
      'Webhook endpoint must be a valid URL',
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebhookEndpointValidationError(
      'Webhook endpoint must use http or https',
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new WebhookEndpointValidationError(
      'Webhook endpoint cannot target localhost',
    );
  }

  const literalVersion = isIP(hostname);
  if (literalVersion !== 0) {
    if (isBlockedAddress(hostname)) {
      throw new WebhookEndpointValidationError(
        'Webhook endpoint cannot target private or reserved IPs',
      );
    }
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((address) => isBlockedAddress(address.address))
  ) {
    throw new WebhookEndpointValidationError(
      'Webhook endpoint cannot resolve to private or reserved IPs',
    );
  }
}
