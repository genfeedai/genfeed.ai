import 'server-only';

import { BlockList, isIP } from 'node:net';
import {
  parseTrustProxy,
  type TrustProxySetting,
} from '@genfeedai/config/deployment';
import { PlatformRole } from '@genfeedai/contracts';
import type { IUser } from '@genfeedai/contracts/interfaces';
import type { AccessBootstrapState } from '@services/auth/auth.service';
import { headers } from 'next/headers';

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

/** Express's named `trust proxy` ranges, so one `TRUST_PROXY` serves API and app. */
const NAMED_TRUST_RANGES: Record<string, string[]> = {
  linklocal: ['169.254.0.0/16', 'fe80::/10'],
  loopback: ['127.0.0.1/8', '::1/128'],
  uniquelocal: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'],
};

function ipFamily(ip: string): 'ipv4' | 'ipv6' | null {
  const version = isIP(ip);
  return version === 4 ? 'ipv4' : version === 6 ? 'ipv6' : null;
}

function buildTrustedProxyList(entries: string[]): BlockList {
  const trusted = new BlockList();

  for (const entry of entries.flatMap(
    (value) => NAMED_TRUST_RANGES[value.toLowerCase()] ?? [value],
  )) {
    const [address = '', prefix] = entry.split('/');
    const normalized = normalizeIp(address);
    const family = ipFamily(normalized);
    if (!family) {
      continue;
    }

    if (prefix === undefined) {
      trusted.addAddress(normalized, family);
    } else if (/^\d+$/.test(prefix)) {
      trusted.addSubnet(normalized, Number(prefix), family);
    }
  }

  return trusted;
}

/**
 * Pick the client from `x-forwarded-for` the way Express does for the same
 * `trust proxy` value. Next does not append the peer that connected to it, so
 * the rightmost entry is what the nearest trusted proxy recorded.
 */
function selectForwardedClientIp(
  forwardedFor: string,
  trustProxy: TrustProxySetting,
): string {
  const hops = forwardedFor
    .split(',')
    .map(normalizeIp)
    .filter(Boolean)
    .reverse();

  if (hops.length === 0 || trustProxy === false || trustProxy === 0) {
    return '';
  }
  const furthestHop = hops[hops.length - 1] ?? '';
  if (trustProxy === true) {
    return furthestHop;
  }
  if (typeof trustProxy === 'number') {
    return hops[Math.min(trustProxy, hops.length) - 1] ?? '';
  }

  const trusted = buildTrustedProxyList(trustProxy);
  return (
    hops.find((ip) => {
      const family = ipFamily(ip);
      return !family || !trusted.check(ip, family);
    }) ?? furthestHop
  );
}

/**
 * The visitor's IP. Vercel overwrites `x-forwarded-for` / `x-real-ip`, so its
 * first entry is the client. Anywhere else the header is whatever the client
 * sent unless a proxy rewrote it, so it is honoured only when `TRUST_PROXY`
 * names that proxy; setting it asserts this port is reachable only through it.
 */
async function resolveServerRequestIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for') ?? '';

  if (process.env.VERCEL === '1') {
    return normalizeIp(
      forwardedFor.split(',')[0] || requestHeaders.get('x-real-ip') || '',
    );
  }

  return selectForwardedClientIp(
    forwardedFor,
    parseTrustProxy(process.env.TRUST_PROXY ?? ''),
  );
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
 * The API judges super-admin on the caller's IP, but the server-side bootstrap
 * reaches it from this server's IP. Re-derive the flag from the account role
 * and the visitor's IP; the API still enforces every admin call on its own.
 */
export async function resolveServerSuperAdmin(
  access: AccessBootstrapState,
  currentUser: IUser | null | undefined,
): Promise<boolean> {
  const hasSuperAdminRole =
    access.isSuperAdmin === true ||
    currentUser?.platformRole === PlatformRole.SUPERADMIN;

  return hasSuperAdminRole && (await isAdminIpAllowedForServerRequest());
}
