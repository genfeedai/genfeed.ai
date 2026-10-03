import 'server-only';

import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { PlatformRole } from '@genfeedai/contracts';
import type { IUser } from '@genfeedai/contracts/interfaces';
import type { AccessBootstrapState } from '@services/auth/auth.service';
import { headers } from 'next/headers';

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

/**
 * The visitor's IP as the edge reports it. Vercel overwrites
 * `x-forwarded-for` / `x-real-ip`, so the first entry is the client.
 */
async function resolveServerRequestIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0];
  return normalizeIp(forwardedFor || requestHeaders.get('x-real-ip') || '');
}

export async function isAdminIpAllowedForServerRequest(): Promise<boolean> {
  const allowedIps = (process.env.ADMIN_ALLOWED_IPS || '')
    .split(',')
    .map(normalizeIp)
    .filter(Boolean);
  const clientIp = await resolveServerRequestIp();

  return clientIp !== '' && allowedIps.includes(clientIp);
}

/**
 * The API judges super-admin on the caller's IP, and the server-side bootstrap
 * declares its caller unknown, so the API never grants it. Re-derive the flag
 * from the account role and the visitor's IP; the API still enforces every
 * admin call on its own. In LOCAL mode every request runs as the seeded local
 * admin, so only the visitor's IP decides.
 */
export async function resolveServerSuperAdmin(
  access: AccessBootstrapState,
  currentUser: IUser | null | undefined,
): Promise<boolean> {
  const isLocalIdentity = isSelfHostedDeployment() && !isBetterAuthEnabled();
  const hasSuperAdminRole =
    isLocalIdentity ||
    access.isSuperAdmin === true ||
    currentUser?.platformRole === PlatformRole.SUPERADMIN;

  return hasSuperAdminRole && (await isAdminIpAllowedForServerRequest());
}
