/**
 * Every admin surface — the `/admin/*` endpoints and super-admin power on any
 * other endpoint — is reachable only from `ADMIN_ALLOWED_IPS`. An empty list
 * blocks everyone, on Cloud and self-host alike.
 */
export interface AdminIpRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  /** Proxy-reported addresses Express accepted under `trust proxy`. */
  ips?: string[];
  socket?: { remoteAddress?: string };
}

/**
 * Headers a forwarding hop adds. Next's `/v1` rewrite always sets
 * `x-forwarded-host`, overriding any client value.
 */
const FORWARDING_HEADERS = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
] as const;

export function normalizeAdminIp(ip: string): string {
  const trimmed = ip.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

function isLoopbackIp(ip: string): boolean {
  return ip === '::1' || ip.startsWith('127.');
}

/**
 * A loopback peer that forwarded the request without a trusted hop naming the
 * client. The app's `/v1` rewrite is such a peer: Next proxies over loopback and
 * never appends the connecting address to `X-Forwarded-For`, so the peer's own
 * address says nothing about who sent the request.
 */
function isUnattributedLoopbackForward(request: AdminIpRequest): boolean {
  const peerIp = normalizeAdminIp(request.socket?.remoteAddress || '');
  if (!isLoopbackIp(peerIp) || (request.ips?.length ?? 0) > 0) {
    return false;
  }

  return FORWARDING_HEADERS.some(
    (header) => request.headers?.[header] !== undefined,
  );
}

export function getAdminAllowedIps(): string[] {
  return (process.env.ADMIN_ALLOWED_IPS || '')
    .split(',')
    .map(normalizeAdminIp)
    .filter(Boolean);
}

/**
 * `request.ip` is the client address Express derives under `trust proxy 1`.
 * Empty when the client cannot be known: a loopback forwarder such as the app's
 * `/v1` rewrite reached the API and no trusted hop reported the real client.
 */
export function resolveAdminClientIp(request: AdminIpRequest): string {
  if (isUnattributedLoopbackForward(request)) {
    return '';
  }

  return normalizeAdminIp(request.ip || request.socket?.remoteAddress || '');
}

export function isAdminIpAllowed(request: AdminIpRequest): boolean {
  const clientIp = resolveAdminClientIp(request);
  return clientIp !== '' && getAdminAllowedIps().includes(clientIp);
}
