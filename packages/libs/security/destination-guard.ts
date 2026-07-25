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

function parseHttpUrl(input: string | URL): URL {
  let url: URL;

  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    throw new DestinationGuardError('Destination must be a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DestinationGuardError(
      'Destination must use the http or https scheme',
    );
  }

  if (url.username || url.password) {
    throw new DestinationGuardError(
      'Destination URLs must not contain credentials',
    );
  }

  return url;
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
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
      throw new DestinationGuardError(
        `Allowed destination must be an origin: ${origin}`,
      );
    }
    normalized.add(parsed.origin);
  }

  return normalized;
}

function assertPolicy(
  url: URL,
  allowedOrigins: ReadonlySet<string> | undefined,
  allowPrivateNetwork: boolean,
): void {
  if (allowPrivateNetwork && (!allowedOrigins || allowedOrigins.size === 0)) {
    throw new DestinationGuardError(
      'Private-network destinations require an explicit origin allowlist',
    );
  }

  if (allowedOrigins && !allowedOrigins.has(url.origin)) {
    throw new DestinationGuardError(
      `Destination origin is not allowed: ${url.origin}`,
    );
  }
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

  const hostname = url.hostname.startsWith('[')
    ? url.hostname.slice(1, -1)
    : url.hostname;
  const literalFamily = isIP(hostname);
  const addresses =
    literalFamily === 0
      ? await lookup(hostname, { all: true, verbatim: true })
      : [{ address: hostname, family: literalFamily }];

  if (addresses.length === 0) {
    throw new DestinationGuardError(
      `Destination hostname did not resolve: ${hostname}`,
    );
  }

  for (const record of addresses) {
    if (!allowPrivateNetwork && isBlockedDestinationAddress(record.address)) {
      throw new DestinationGuardError(
        `Destination resolves to a private or reserved address: ${record.address}`,
      );
    }
  }

  const selected = addresses[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new DestinationGuardError(
      `Destination hostname returned an unsupported address: ${hostname}`,
    );
  }

  return {
    address: selected.address,
    family: selected.family,
    url,
  };
}

function createPinnedAgent(destination: ResolvedDestination) {
  const lookupPinnedAddress: LookupFunction = (hostname, options, callback) => {
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

interface SerializedRequestBody {
  contentType?: string;
  value?: string | Buffer;
}

async function serializeRequestBody(
  body: BodyInit | null | undefined,
): Promise<SerializedRequestBody> {
  if (body === undefined || body === null) {
    return {};
  }

  if (typeof body === 'string') {
    return { value: body };
  }

  if (body instanceof URLSearchParams) {
    return {
      contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
      value: String(body),
    };
  }

  if (body instanceof ArrayBuffer) {
    return { value: Buffer.from(body) };
  }

  if (ArrayBuffer.isView(body)) {
    return {
      value: Buffer.from(body.buffer, body.byteOffset, body.byteLength),
    };
  }

  if (body instanceof Blob) {
    return {
      contentType: body.type || undefined,
      value: Buffer.from(await body.arrayBuffer()),
    };
  }

  throw new DestinationGuardError(
    'Unsupported request body for guarded outbound request',
  );
}

async function requestPinnedDestination(
  destination: ResolvedDestination,
  init: RequestInit,
): Promise<Response> {
  const agent = createPinnedAgent(destination);
  const serializedBody = await serializeRequestBody(init.body);
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set('accept-encoding', 'identity');
  if (serializedBody.contentType && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', serializedBody.contentType);
  }
  if (
    serializedBody.value !== undefined &&
    !requestHeaders.has('content-length')
  ) {
    requestHeaders.set(
      'content-length',
      String(Buffer.byteLength(serializedBody.value)),
    );
  }
  const headers = Object.fromEntries(requestHeaders.entries());
  const requestFunction =
    destination.url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    // The URL has passed the shared policy, and the custom agent connects only
    // to the exact DNS answer checked above.
    // codeql[js/request-forgery] reason: DNS is validated and the socket is pinned.
    const request = requestFunction(
      destination.url,
      {
        agent,
        headers,
        method: init.method ?? 'GET',
        signal: init.signal ?? undefined,
      },
      (incoming) => {
        const status = incoming.statusCode ?? 500;
        const hasBody =
          (init.method ?? 'GET').toUpperCase() !== 'HEAD' &&
          !RESPONSE_WITHOUT_BODY_STATUSES.has(status);
        const body = hasBody
          ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>)
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
        resolve(response);
      },
    );

    request.once('error', reject);
    request.end(serializedBody.value);
  });
}

function redirectedRequestInit(
  init: RequestInit,
  status: number,
  from: URL,
  to: URL,
): RequestInit {
  const headers = new Headers(init.headers);
  if (from.origin !== to.origin) {
    headers.delete('authorization');
    headers.delete('cookie');
    headers.delete('proxy-authorization');
  }

  const method = (init.method ?? 'GET').toUpperCase();
  const switchToGet =
    status === 303 || ((status === 301 || status === 302) && method === 'POST');

  return {
    ...init,
    body: switchToGet ? undefined : init.body,
    headers,
    method: switchToGet ? 'GET' : method,
  };
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
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
    throw new DestinationGuardError(
      'maxRedirects must be a non-negative integer',
    );
  }

  let currentUrl = parseHttpUrl(input);
  let currentInit = { ...init };

  for (let redirectCount = 0; ; redirectCount++) {
    const destination = await resolveSafeDestination(currentUrl, options);
    const response = await requestPinnedDestination(destination, currentInit);
    const location = response.headers.get('location');
    const isRedirect = REDIRECT_STATUSES.has(response.status) && location;

    if (!isRedirect || currentInit.redirect === 'manual') {
      if (redirectCount > 0) {
        Object.defineProperty(response, 'redirected', { value: true });
      }
      return response;
    }

    if (currentInit.redirect === 'error') {
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

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      await response.body?.cancel();
      throw new DestinationGuardError(
        `Destination returned an invalid redirect: ${location}`,
      );
    }

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
