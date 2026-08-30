import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { Agent as HttpAgent, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RESPONSE_WITHOUT_BODY_STATUSES = new Set([204, 205, 304]);

// Keep IPv4 and IPv6 ranges in separate lists. Node's BlockList internally
// represents IPv4 as mapped IPv6, so combining them with ::ffff:0:0/96 would
// accidentally classify every ordinary IPv4 address as blocked.
const BLOCKED_IPV4_DESTINATIONS = new BlockList();
const BLOCKED_IPV6_DESTINATIONS = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_IPV4_DESTINATIONS.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 96],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_IPV6_DESTINATIONS.addSubnet(network, prefix, 'ipv6');
}

export interface DestinationGuardOptions {
  /**
   * Exact origins trusted by configuration. Redirects must remain within this
   * set. Required when private-network access is enabled.
   */
  allowedOrigins?: readonly string[];
  /**
   * Permit an allowlisted configured origin to resolve inside the private
   * network. Intended only for trusted service-to-service URLs.
   */
  allowPrivateNetwork?: boolean;
  /** Maximum redirects to follow. Defaults to five. */
  maxRedirects?: number;
}

export interface ResolvedDestination {
  address: string;
  family: 4 | 6;
  url: URL;
}

export class DestinationGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DestinationGuardError';
  }
}

type SerializedRequestBody = {
  contentType?: string;
  value?: string | Buffer;
};

function parseAbsoluteUrl(input: string | URL): URL {
  try {
    return input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    throw new DestinationGuardError('Destination must be a valid URL');
  }
}

function assertHttpScheme(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DestinationGuardError(
      'Destination must use the http or https scheme',
    );
  }
}

function assertNoEmbeddedCredentials(url: URL): void {
  if (url.username || url.password) {
    throw new DestinationGuardError(
      'Destination URLs must not contain credentials',
    );
  }
}

function parseHttpUrl(input: string | URL): URL {
  const url = parseAbsoluteUrl(input);
  assertHttpScheme(url);
  assertNoEmbeddedCredentials(url);
  return url;
}

function assertBareOrigin(parsed: URL, origin: string): void {
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new DestinationGuardError(
      `Allowed destination must be an origin: ${origin}`,
    );
  }
}

function normalizeAllowedOrigins(
  allowedOrigins: readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  if (!allowedOrigins) {
    return undefined;
  }

  const normalized = new Set<string>();
  for (const origin of allowedOrigins) {
    const parsed = parseHttpUrl(origin);
    assertBareOrigin(parsed, origin);
    normalized.add(parsed.origin);
  }

  return normalized;
}

function assertPrivateNetworkAllowlist(
  allowedOrigins: ReadonlySet<string> | undefined,
  allowPrivateNetwork: boolean,
): void {
  if (allowPrivateNetwork && (!allowedOrigins || allowedOrigins.size === 0)) {
    throw new DestinationGuardError(
      'Private-network destinations require an explicit origin allowlist',
    );
  }
}

function assertAllowedOrigin(
  url: URL,
  allowedOrigins: ReadonlySet<string> | undefined,
): void {
  if (allowedOrigins && !allowedOrigins.has(url.origin)) {
    throw new DestinationGuardError(
      `Destination origin is not allowed: ${url.origin}`,
    );
  }
}

function assertPolicy(
  url: URL,
  allowedOrigins: ReadonlySet<string> | undefined,
  allowPrivateNetwork: boolean,
): void {
  assertPrivateNetworkAllowlist(allowedOrigins, allowPrivateNetwork);
  assertAllowedOrigin(url, allowedOrigins);
}

export function isBlockedDestinationAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return BLOCKED_IPV4_DESTINATIONS.check(address, 'ipv4');
  }
  if (family === 6) {
    return BLOCKED_IPV6_DESTINATIONS.check(address, 'ipv6');
  }
  return true;
}

function unwrapHostname(hostname: string): string {
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}

async function lookupDestinationAddresses(
  hostname: string,
): Promise<readonly LookupAddress[]> {
  const literalFamily = isIP(hostname);
  if (literalFamily === 0) {
    return lookup(hostname, { all: true, verbatim: true });
  }

  return [{ address: hostname, family: literalFamily }];
}

function assertPublicAddresses(
  addresses: readonly LookupAddress[],
  allowPrivateNetwork: boolean,
): void {
  if (allowPrivateNetwork) {
    return;
  }

  for (const record of addresses) {
    if (isBlockedDestinationAddress(record.address)) {
      throw new DestinationGuardError(
        `Destination resolves to a private or reserved address: ${record.address}`,
      );
    }
  }
}

function selectResolvedAddress(
  addresses: readonly LookupAddress[],
  hostname: string,
): LookupAddress & { family: 4 | 6 } {
  const selected = addresses[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new DestinationGuardError(
      `Destination hostname returned an unsupported address: ${hostname}`,
    );
  }

  return {
    address: selected.address,
    family: selected.family,
  };
}

function assertResolvedAddresses(
  addresses: readonly LookupAddress[],
  hostname: string,
  allowPrivateNetwork: boolean,
): LookupAddress & { family: 4 | 6 } {
  if (addresses.length === 0) {
    throw new DestinationGuardError(
      `Destination hostname did not resolve: ${hostname}`,
    );
  }

  assertPublicAddresses(addresses, allowPrivateNetwork);
  return selectResolvedAddress(addresses, hostname);
}

/**
 * Resolve and validate every address for a URL before choosing the exact
 * address the request will connect to.
 */
export async function resolveSafeDestination(
  input: string | URL,
  options: DestinationGuardOptions = {},
): Promise<ResolvedDestination> {
  const url = parseHttpUrl(input);
  const allowedOrigins = normalizeAllowedOrigins(options.allowedOrigins);
  const allowPrivateNetwork = options.allowPrivateNetwork ?? false;
  assertPolicy(url, allowedOrigins, allowPrivateNetwork);

  const hostname = unwrapHostname(url.hostname);
  const addresses = await lookupDestinationAddresses(hostname);
  const selected = assertResolvedAddresses(
    addresses,
    hostname,
    allowPrivateNetwork,
  );

  return {
    address: selected.address,
    family: selected.family,
    url,
  };
}

function createPinnedLookup(destination: ResolvedDestination): LookupFunction {
  return (hostname, options, callback) => {
    if (hostname !== destination.url.hostname) {
      callback(
        new DestinationGuardError(
          `Unexpected destination hostname during connection: ${hostname}`,
        ),
        options.all ? [] : '',
        destination.family,
      );
      return;
    }

    if (options.all) {
      callback(null, [
        {
          address: destination.address,
          family: destination.family,
        },
      ]);
      return;
    }

    callback(null, destination.address, destination.family);
  };
}

function createPinnedAgent(destination: ResolvedDestination) {
  const lookupPinnedAddress = createPinnedLookup(destination);

  return destination.url.protocol === 'https:'
    ? new HttpsAgent({ keepAlive: false, lookup: lookupPinnedAddress })
    : new HttpAgent({ keepAlive: false, lookup: lookupPinnedAddress });
}

function createResponseHeaders(rawHeaders: readonly string[]): Headers {
  const headers = new Headers();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (name && value !== undefined) {
      headers.append(name, value);
    }
  }
  return headers;
}

function serializeTextRequestBody(
  body: BodyInit,
): SerializedRequestBody | undefined {
  if (typeof body === 'string') {
    return { value: body };
  }

  if (body instanceof URLSearchParams) {
    return {
      contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
      value: String(body),
    };
  }

  return undefined;
}

function serializeBufferLikeBody(
  body: BodyInit,
): SerializedRequestBody | undefined {
  if (body instanceof ArrayBuffer) {
    return { value: Buffer.from(body) };
  }

  if (ArrayBuffer.isView(body)) {
    return {
      value: Buffer.from(body.buffer, body.byteOffset, body.byteLength),
    };
  }

  return undefined;
}

async function serializeBlobBody(body: Blob): Promise<SerializedRequestBody> {
  return {
    contentType: body.type || undefined,
    value: Buffer.from(await body.arrayBuffer()),
  };
}

async function serializeRequestBody(
  body: BodyInit | null | undefined,
): Promise<SerializedRequestBody> {
  if (body === undefined || body === null) {
    return {};
  }

  const serialized =
    serializeTextRequestBody(body) ?? serializeBufferLikeBody(body);
  if (serialized) {
    return serialized;
  }

  if (body instanceof Blob) {
    return serializeBlobBody(body);
  }

  throw new DestinationGuardError(
    'Unsupported request body for guarded outbound request',
  );
}

function applySerializedBodyHeaders(
  headers: Headers,
  serializedBody: SerializedRequestBody,
): void {
  if (serializedBody.contentType && !headers.has('content-type')) {
    headers.set('content-type', serializedBody.contentType);
  }

  if (serializedBody.value !== undefined && !headers.has('content-length')) {
    headers.set(
      'content-length',
      String(Buffer.byteLength(serializedBody.value)),
    );
  }
}

function hasResponseBody(method: string, status: number): boolean {
  return method !== 'HEAD' && !RESPONSE_WITHOUT_BODY_STATUSES.has(status);
}

function nodeReadableToResponseBody(
  readable: Readable,
): ReadableStream<Uint8Array> {
  const iterator = readable[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async cancel(reason) {
      readable.destroy(reason instanceof Error ? reason : undefined);
      await iterator.return?.();
    },
    async pull(controller) {
      try {
        const result: IteratorResult<unknown> = await iterator.next();
        if (result.done) {
          controller.close();
          return;
        }

        if (result.value instanceof Uint8Array) {
          controller.enqueue(result.value);
          return;
        }
        if (typeof result.value === 'string') {
          controller.enqueue(Buffer.from(result.value));
          return;
        }

        throw new TypeError('Pinned response emitted a non-byte chunk');
      } catch (error: unknown) {
        controller.error(error);
      }
    },
  });
}

function createPinnedResponse(
  incoming: Readable & {
    rawHeaders: readonly string[];
    statusCode?: number;
    statusMessage?: string;
  },
  init: RequestInit,
  destination: ResolvedDestination,
): Response {
  const status = incoming.statusCode ?? 500;
  const method = (init.method ?? 'GET').toUpperCase();
  const body = hasResponseBody(method, status)
    ? nodeReadableToResponseBody(incoming)
    : null;

  const response = new Response(body, {
    headers: createResponseHeaders(incoming.rawHeaders),
    status,
    statusText: incoming.statusMessage,
  });
  Object.defineProperty(response, 'url', {
    configurable: true,
    value: destination.url.href,
  });
  return response;
}

async function requestPinnedDestination(
  destination: ResolvedDestination,
  init: RequestInit,
): Promise<Response> {
  const agent = createPinnedAgent(destination);
  const serializedBody = await serializeRequestBody(init.body);
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set('accept-encoding', 'identity');
  applySerializedBodyHeaders(requestHeaders, serializedBody);
  const headers = Object.fromEntries(requestHeaders.entries());
  const requestFunction =
    destination.url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    // The URL has passed the shared policy, and the custom agent connects only
    // to the exact DNS answer checked above.
    const request =
      /* lgtm[js/request-forgery] DNS-checked/IP-pinned. */ requestFunction(
        destination.url,
        {
          agent,
          headers,
          method: init.method ?? 'GET',
          signal: init.signal ?? undefined,
        },
        (incoming) => {
          resolve(createPinnedResponse(incoming, init, destination));
        },
      );

    request.once('error', reject);
    request.end(serializedBody.value);
  });
}

function stripCrossOriginHeaders(headers: Headers, from: URL, to: URL): void {
  if (from.origin === to.origin) {
    return;
  }

  headers.delete('authorization');
  headers.delete('cookie');
  headers.delete('proxy-authorization');
}

function shouldSwitchRedirectToGet(status: number, method: string): boolean {
  return (
    status === 303 || ((status === 301 || status === 302) && method === 'POST')
  );
}

function redirectedRequestInit(
  init: RequestInit,
  status: number,
  from: URL,
  to: URL,
): RequestInit {
  const headers = new Headers(init.headers);
  stripCrossOriginHeaders(headers, from, to);

  const method = (init.method ?? 'GET').toUpperCase();
  const switchToGet = shouldSwitchRedirectToGet(status, method);

  return {
    ...init,
    body: switchToGet ? undefined : init.body,
    headers,
    method: switchToGet ? 'GET' : method,
  };
}

function assertMaxRedirects(maxRedirects: number): void {
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
    throw new DestinationGuardError(
      'maxRedirects must be a non-negative integer',
    );
  }
}

function isRedirectResponse(
  response: Response,
  location: string | null,
): location is string {
  return Boolean(location) && REDIRECT_STATUSES.has(response.status);
}

function markRedirected(response: Response, redirectCount: number): Response {
  if (redirectCount > 0) {
    Object.defineProperty(response, 'redirected', { value: true });
  }
  return response;
}

async function assertRedirectAllowed(
  init: RequestInit,
  redirectCount: number,
  maxRedirects: number,
  currentUrl: URL,
  response: Response,
): Promise<void> {
  if (init.redirect === 'error') {
    await response.body?.cancel();
    throw new DestinationGuardError(
      `Redirects are disabled for destination: ${currentUrl.href}`,
    );
  }

  if (redirectCount >= maxRedirects) {
    await response.body?.cancel();
    throw new DestinationGuardError(
      `Destination exceeded ${maxRedirects} redirects`,
    );
  }
}

async function parseRedirectLocation(
  location: string,
  currentUrl: URL,
  response: Response,
): Promise<URL> {
  try {
    return new URL(location, currentUrl);
  } catch {
    await response.body?.cancel();
    throw new DestinationGuardError(
      `Destination returned an invalid redirect: ${location}`,
    );
  }
}

/**
 * Fetch through the shared outbound destination boundary.
 *
 * Every hop is parsed, policy-checked, fully resolved, and connected through an
 * agent pinned to the selected checked address. Redirects are followed
 * manually so a public URL cannot bounce into an internal network.
 */
export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  options: DestinationGuardOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  assertMaxRedirects(maxRedirects);

  let currentUrl = parseHttpUrl(input);
  let currentInit = { ...init };

  for (let redirectCount = 0; ; redirectCount++) {
    const destination = await resolveSafeDestination(currentUrl, options);
    const response = await requestPinnedDestination(destination, currentInit);
    const location = response.headers.get('location');
    if (
      !isRedirectResponse(response, location) ||
      currentInit.redirect === 'manual'
    ) {
      return markRedirected(response, redirectCount);
    }

    if (!location) {
      return markRedirected(response, redirectCount);
    }

    await assertRedirectAllowed(
      currentInit,
      redirectCount,
      maxRedirects,
      currentUrl,
      response,
    );
    const nextUrl = await parseRedirectLocation(location, currentUrl, response);
    await response.body?.cancel();
    currentInit = redirectedRequestInit(
      currentInit,
      response.status,
      currentUrl,
      nextUrl,
    );
    currentUrl = nextUrl;
  }
}
