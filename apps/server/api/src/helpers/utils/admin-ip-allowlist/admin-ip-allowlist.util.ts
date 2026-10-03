import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';

/**
 * Every admin surface — the `/admin/*` endpoints and super-admin power on any
 * other endpoint — is reachable only from `ADMIN_ALLOWED_IPS`. An empty list
 * blocks everyone, on Cloud and self-host alike.
 */
export interface AdminIpRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export function normalizeAdminIp(ip: string): string {
  const trimmed = ip.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

export function getAdminAllowedIps(): string[] {
  return (process.env.ADMIN_ALLOWED_IPS || '')
    .split(',')
    .map(normalizeAdminIp)
    .filter(Boolean);
}

/**
 * A caller that declares its client unknown (RFC 7239 `for=unknown`), as the
 * app server does on every server-side call. Honoured whatever the peer or
 * trusted hops say: sending it can only take admin access away.
 */
function declaresUnknownClient(request: AdminIpRequest): boolean {
  const forwarded = request.headers?.[UNATTRIBUTED_FORWARDED_HEADER];
  const values = Array.isArray(forwarded) ? forwarded : [forwarded ?? ''];

  return values.some((value) =>
    value
      .split(/[,;]/)
      .some(
        (pair) =>
          pair.trim().toLowerCase().replaceAll('"', '') ===
          UNATTRIBUTED_FORWARDED_VALUE,
      ),
  );
}

/**
 * `request.ip` is the client address Express derives under `trust proxy 1`.
 * Empty when the caller declares the client unknown.
 */
export function resolveAdminClientIp(request: AdminIpRequest): string {
  if (declaresUnknownClient(request)) {
    return '';
  }

  return normalizeAdminIp(request.ip || request.socket?.remoteAddress || '');
}

export function isAdminIpAllowed(request: AdminIpRequest): boolean {
  const clientIp = resolveAdminClientIp(request);
  return clientIp !== '' && getAdminAllowedIps().includes(clientIp);
}
