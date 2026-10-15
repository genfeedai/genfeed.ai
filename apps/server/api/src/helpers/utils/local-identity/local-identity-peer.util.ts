import { BlockList } from 'node:net';
import {
  type AdminIpRequest,
  normalizeAdminIp,
} from '@api/helpers/utils/admin-ip-allowlist/admin-ip-allowlist.util';
import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';

/**
 * Peers allowed to act as the seeded local admin when login is off
 * (`BETTER_AUTH_ENABLED` unset or false): this machine, and the private range
 * Docker allocates to its bridge networks, which is where the web container
 * reaches the API from. Every other address needs a credential.
 */
const LOCAL_PEERS = new BlockList();
LOCAL_PEERS.addSubnet('127.0.0.0', 8, 'ipv4');
LOCAL_PEERS.addAddress('::1', 'ipv6');
LOCAL_PEERS.addSubnet('172.16.0.0', 12, 'ipv4');

/** Headers a reverse proxy uses to name the client it forwards for. */
const CLIENT_ATTRIBUTION_HEADERS = ['x-forwarded-for', 'x-real-ip'] as const;

function headerValues(request: AdminIpRequest, header: string): string[] {
  const value = request.headers?.[header];
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

/**
 * A `Forwarded` element naming a client other than "unknown". The app server
 * and the other internal services send `for=unknown` on their own calls, so
 * that value is not a proxy reporting a remote client.
 */
function forwardedNamesClient(request: AdminIpRequest): boolean {
  return headerValues(request, UNATTRIBUTED_FORWARDED_HEADER).some((value) =>
    value.split(',').some((element) =>
      element.split(';').some((pair) => {
        const [key, ...rest] = pair.trim().split('=');
        return (
          key?.toLowerCase() === 'for' &&
          rest.join('=').replaceAll('"', '').toLowerCase() !==
            UNATTRIBUTED_FORWARDED_VALUE.slice('for='.length)
        );
      }),
    ),
  );
}

/**
 * A proxy in front of the API reported a client address that Express did not
 * accept (`request.ips` is empty), i.e. `TRUST_PROXY` does not name that proxy.
 * The socket peer is then the proxy, not the client, so it proves nothing
 * about who is calling.
 */
function hasUntrustedClientAttribution(request: AdminIpRequest): boolean {
  if ((request.ips?.length ?? 0) > 0) {
    return false;
  }

  return (
    CLIENT_ATTRIBUTION_HEADERS.some(
      (header) => headerValues(request, header).length > 0,
    ) || forwardedNamesClient(request)
  );
}

function isLocalPeerAddress(ip: string): boolean {
  if (ip === '') {
    return false;
  }

  try {
    return LOCAL_PEERS.check(ip, ip.includes(':') ? 'ipv6' : 'ipv4');
  } catch {
    return false;
  }
}

/**
 * Whether a tokenless request may fall back to the seeded local admin.
 *
 * The client address is `request.ip`, which Express derives under the
 * deployment's `trust proxy` setting: no forwarded header is believed unless
 * `TRUST_PROXY` names the proxy. A request that still carries a proxy's client
 * attribution is refused rather than judged on the proxy's own address, so a
 * reverse proxy reporting a remote client cannot turn it into a local one.
 * Docker port NAT can omit that attribution entirely, so Compose must also
 * publish the API on host loopback only. An address check cannot distinguish
 * a real Docker peer from an unattributed connection through its gateway.
 */
export function isLocalIdentityPeer(request: AdminIpRequest): boolean {
  if (hasUntrustedClientAttribution(request)) {
    return false;
  }

  return isLocalPeerAddress(
    normalizeAdminIp(request.ip || request.socket?.remoteAddress || ''),
  );
}
