import { lookup } from 'node:dns/promises';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { getRequestedAddressFamily } from '@api/services/webhook-client/webhook-address-family.util';
import { isBlockedDestinationAddress } from '@libs/security/destination-guard';

const BLOCKED_HOSTNAMES = new Set(['localhost']);

export interface ValidatedWebhookAddress {
  address: string;
  family: 4 | 6;
}

export interface ValidatedWebhookEndpoint {
  addresses: readonly ValidatedWebhookAddress[];
  hostname: string;
  url: URL;
}

export class WebhookEndpointValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookEndpointValidationError';
  }
}

function normalizeHostname(hostname: string): string {
  const normalized = hostname.toLowerCase();
  return normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;
}

function createValidatedWebhookAddress(
  address: string,
  reportedFamily: number,
): ValidatedWebhookAddress {
  const parsedFamily = isIP(address);
  if (
    (parsedFamily !== 4 && parsedFamily !== 6) ||
    parsedFamily !== reportedFamily
  ) {
    throw new WebhookEndpointValidationError(
      'Webhook endpoint returned an unsupported address family',
    );
  }

  return {
    address,
    family: parsedFamily,
  };
}

function filterAddressesByFamily(
  addresses: ValidatedWebhookAddress[],
  family: 4 | 6 | undefined,
): ValidatedWebhookAddress[] {
  if (!family) {
    return addresses;
  }

  return addresses.filter((address) => address.family === family);
}

export async function assertSafeWebhookEndpoint(
  endpoint: string,
): Promise<ValidatedWebhookEndpoint> {
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

  const hostname = normalizeHostname(url.hostname);
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new WebhookEndpointValidationError(
      'Webhook endpoint cannot target localhost',
    );
  }

  const literalVersion = isIP(hostname) as 0 | 4 | 6;
  if (literalVersion !== 0) {
    if (isBlockedDestinationAddress(hostname)) {
      throw new WebhookEndpointValidationError(
        'Webhook endpoint cannot target private or reserved IPs',
      );
    }
    return {
      addresses: [createValidatedWebhookAddress(hostname, literalVersion)],
      hostname,
      url,
    };
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((address) => isBlockedDestinationAddress(address.address))
  ) {
    throw new WebhookEndpointValidationError(
      'Webhook endpoint cannot resolve to private or reserved IPs',
    );
  }

  return {
    addresses: addresses.map((address) =>
      createValidatedWebhookAddress(address.address, address.family),
    ),
    hostname,
    url,
  };
}

export function createPinnedWebhookAgent(
  endpoint: ValidatedWebhookEndpoint,
): HttpAgent | HttpsAgent {
  const addresses = [...endpoint.addresses];
  const firstAddress = addresses[0];
  if (!firstAddress) {
    throw new WebhookEndpointValidationError(
      'Webhook endpoint has no validated public addresses',
    );
  }

  const lookupPinnedAddress: LookupFunction = (
    requestedHostname,
    options,
    callback,
  ) => {
    const rejectLookup = (error: Error, family: 4 | 6): void => {
      callback(error, options.all ? [] : '', family);
    };
    const resolveLookup = (
      eligibleAddresses: ValidatedWebhookAddress[],
      selectedAddress: ValidatedWebhookAddress,
    ): void => {
      if (options.all) {
        callback(null, eligibleAddresses);
        return;
      }

      callback(null, selectedAddress.address, selectedAddress.family);
    };

    const normalizedRequestedHostname = normalizeHostname(requestedHostname);
    if (normalizedRequestedHostname !== endpoint.hostname) {
      rejectLookup(
        new WebhookEndpointValidationError(
          `Unexpected webhook hostname during connection: ${requestedHostname}`,
        ),
        firstAddress.family,
      );
      return;
    }

    const requestedFamily = getRequestedAddressFamily(options.family);
    const eligibleAddresses = filterAddressesByFamily(
      addresses,
      requestedFamily,
    );
    const selectedAddress = eligibleAddresses[0];

    if (!selectedAddress) {
      rejectLookup(
        new WebhookEndpointValidationError(
          'Webhook endpoint has no validated address for the requested family',
        ),
        requestedFamily ?? firstAddress.family,
      );
      return;
    }

    resolveLookup(eligibleAddresses, selectedAddress);
  };

  if (endpoint.url.protocol === 'https:') {
    return new HttpsAgent({
      keepAlive: false,
      lookup: lookupPinnedAddress,
      ...(isIP(endpoint.hostname) === 0
        ? { servername: endpoint.hostname }
        : {}),
    });
  }

  return new HttpAgent({
    keepAlive: false,
    lookup: lookupPinnedAddress,
  });
}
