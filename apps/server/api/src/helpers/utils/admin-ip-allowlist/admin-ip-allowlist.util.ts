/**
 * Every admin surface — the `/admin/*` endpoints and super-admin power on any
 * other endpoint — is reachable only from `ADMIN_ALLOWED_IPS`. An empty list
 * blocks everyone, on Cloud and self-host alike.
 */
export interface AdminIpRequest {
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
 * `request.ip` is the client address Express derives under the deployment's
 * `trust proxy` setting: one hop on Cloud, none on self-host unless
 * `TRUST_PROXY` names the proxy (see `resolveTrustProxyFromReader`).
 */
export function resolveAdminClientIp(request: AdminIpRequest): string {
  return normalizeAdminIp(request.ip || request.socket?.remoteAddress || '');
}

export function isAdminIpAllowed(request: AdminIpRequest): boolean {
  const clientIp = resolveAdminClientIp(request);
  return clientIp !== '' && getAdminAllowedIps().includes(clientIp);
}
