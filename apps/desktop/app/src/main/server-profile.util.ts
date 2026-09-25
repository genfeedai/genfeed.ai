import { createHash } from 'node:crypto';
import type {
  DesktopServerKind,
  IDesktopSelfHostedServerConfig,
  IDesktopServerProfile,
} from '@genfeedai/contracts/desktop';

export const GENFEED_CLOUD_SERVER_ID = 'cloud';

export const GENFEED_CLOUD_ENDPOINTS = {
  api: 'https://api.genfeed.ai/v1',
  app: 'https://app.genfeed.ai',
  auth: 'https://app.genfeed.ai/oauth/cli',
  mcp: 'https://mcp.genfeed.ai/mcp',
  ws: 'https://notifications.genfeed.ai',
} as const;

/** Container ports of the self-hosted image (docker/selfhosted-entrypoint.sh). */
const SELF_HOSTED_PORTS = {
  api: '3010',
  app: '3000',
  mcp: '3014',
  ws: '3011',
} as const;

const DESKTOP_OAUTH_PATH = '/oauth/cli';

export class DesktopServerUrlError extends Error {}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

/**
 * Plain HTTP would send the desktop `gf_` key in clear text, so it is only
 * accepted for this machine and private-network hosts.
 */
export function isLocalNetworkHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    isPrivateIpv4(normalized)
  );
}

function parseServerUrl(raw: string, field: string): URL {
  const trimmed = raw.trim();
  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new DesktopServerUrlError(`${field} must be a full URL.`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DesktopServerUrlError(`${field} must use https:// or http://.`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new DesktopServerUrlError(
      `${field} cannot include credentials, a query string, or a fragment.`,
    );
  }

  if (url.protocol === 'http:' && !isLocalNetworkHostname(url.hostname)) {
    throw new DesktopServerUrlError(
      `${field} must use https:// unless the server is on this computer or your private network.`,
    );
  }

  return url;
}

/** Normalizes a user-entered API URL; a bare origin gets the `/v1` base path. */
export function normalizeApiEndpoint(raw: string): string {
  const url = parseServerUrl(raw, 'Server API URL');
  const pathname = trimTrailingSlashes(url.pathname);

  return `${url.origin}${pathname === '' ? '/v1' : pathname}`;
}

function normalizeOptionalEndpoint(
  raw: string | undefined,
  field: string,
): string | undefined {
  if (!raw?.trim()) {
    return undefined;
  }

  const url = parseServerUrl(raw, field);
  return `${url.origin}${trimTrailingSlashes(url.pathname)}`;
}

type DerivedService = 'app' | 'mcp' | 'ws';

const SUBDOMAIN_BY_SERVICE: Record<DerivedService, string> = {
  app: 'app.',
  mcp: 'mcp.',
  ws: 'notifications.',
};

/**
 * Default sibling endpoint for a self-hosted API:
 * - `api.example.com` → `app.` / `mcp.` / `notifications.` subdomains
 * - `host:3010` (the self-hosted image) → ports 3000 / 3014 / 3011
 * - otherwise the API origin (single-origin reverse proxy)
 */
export function deriveSelfHostedEndpoint(
  apiEndpoint: string,
  service: DerivedService,
): string {
  const apiUrl = new URL(apiEndpoint);
  const derived = new URL(apiUrl.origin);

  if (apiUrl.hostname.startsWith('api.')) {
    derived.hostname = `${SUBDOMAIN_BY_SERVICE[service]}${apiUrl.hostname.slice('api.'.length)}`;
  } else if (apiUrl.port === SELF_HOSTED_PORTS.api) {
    derived.port = SELF_HOSTED_PORTS[service];
  }

  const origin = derived.origin;
  return service === 'mcp' ? `${origin}/mcp` : origin;
}

export function buildServerId(
  kind: DesktopServerKind,
  apiEndpoint: string,
): string {
  if (kind === 'cloud') {
    return GENFEED_CLOUD_SERVER_ID;
  }

  const digest = createHash('sha256')
    .update(apiEndpoint.toLowerCase())
    .digest('hex')
    .slice(0, 16);
  return `self-hosted-${digest}`;
}

export function buildCloudServerProfile(): IDesktopServerProfile {
  return {
    apiEndpoint: GENFEED_CLOUD_ENDPOINTS.api,
    appEndpoint: GENFEED_CLOUD_ENDPOINTS.app,
    authEndpoint: GENFEED_CLOUD_ENDPOINTS.auth,
    id: GENFEED_CLOUD_SERVER_ID,
    kind: 'cloud',
    label: 'Genfeed Cloud',
    mcpEndpoint: GENFEED_CLOUD_ENDPOINTS.mcp,
    wsEndpoint: GENFEED_CLOUD_ENDPOINTS.ws,
  };
}

/** Validates and resolves a user-entered self-hosted server. Throws on bad input. */
export function buildSelfHostedServerProfile(
  config: IDesktopSelfHostedServerConfig,
): IDesktopServerProfile {
  const apiEndpoint = normalizeApiEndpoint(config.apiEndpoint);
  const appEndpoint =
    normalizeOptionalEndpoint(config.appEndpoint, 'App URL') ??
    deriveSelfHostedEndpoint(apiEndpoint, 'app');
  const mcpEndpoint =
    normalizeOptionalEndpoint(config.mcpEndpoint, 'MCP URL') ??
    deriveSelfHostedEndpoint(apiEndpoint, 'mcp');
  const wsEndpoint =
    normalizeOptionalEndpoint(config.wsEndpoint, 'Notifications URL') ??
    deriveSelfHostedEndpoint(apiEndpoint, 'ws');
  const appOrigin = new URL(appEndpoint).origin;

  return {
    apiEndpoint,
    // Only an HTTPS app can be loaded as the remote shell; HTTP self-hosted
    // servers run through the bundled shell and its /v1 proxy instead.
    appEndpoint: appOrigin.startsWith('https://') ? appOrigin : null,
    authEndpoint: `${appOrigin}${DESKTOP_OAUTH_PATH}`,
    id: buildServerId('self-hosted', apiEndpoint),
    kind: 'self-hosted',
    label: new URL(apiEndpoint).host,
    mcpEndpoint,
    wsEndpoint,
  };
}

/** Normalized copy of a self-hosted config, suitable for persistence. */
export function normalizeSelfHostedServerConfig(
  config: IDesktopSelfHostedServerConfig,
): IDesktopSelfHostedServerConfig {
  const appEndpoint = normalizeOptionalEndpoint(config.appEndpoint, 'App URL');
  const mcpEndpoint = normalizeOptionalEndpoint(config.mcpEndpoint, 'MCP URL');
  const wsEndpoint = normalizeOptionalEndpoint(
    config.wsEndpoint,
    'Notifications URL',
  );

  return {
    apiEndpoint: normalizeApiEndpoint(config.apiEndpoint),
    ...(appEndpoint ? { appEndpoint } : {}),
    ...(mcpEndpoint ? { mcpEndpoint } : {}),
    ...(wsEndpoint ? { wsEndpoint } : {}),
  };
}

export interface DesktopServerEnvOverrides {
  apiEndpoint?: string;
  authEndpoint?: string;
  mcpEndpoint?: string;
  wsEndpoint?: string;
}

/**
 * The server used when nothing was picked in-app: Genfeed Cloud, or whatever
 * `GENFEED_DESKTOP_*_URL` environment variables point at.
 */
export function buildDefaultServerProfile(
  overrides: DesktopServerEnvOverrides,
): IDesktopServerProfile {
  const cloud = buildCloudServerProfile();
  const apiEndpoint = overrides.apiEndpoint
    ? trimTrailingSlashes(overrides.apiEndpoint.trim())
    : cloud.apiEndpoint;
  const isCloud = apiEndpoint === cloud.apiEndpoint;
  const kind: DesktopServerKind = isCloud ? 'cloud' : 'self-hosted';
  const authEndpoint =
    overrides.authEndpoint ??
    (isCloud
      ? cloud.authEndpoint
      : `${deriveSelfHostedEndpoint(apiEndpoint, 'app')}${DESKTOP_OAUTH_PATH}`);
  const authUrl = new URL(authEndpoint);

  return {
    apiEndpoint,
    appEndpoint: authUrl.protocol === 'https:' ? authUrl.origin : null,
    authEndpoint,
    id: buildServerId(kind, apiEndpoint),
    kind,
    label: isCloud ? cloud.label : new URL(apiEndpoint).host,
    mcpEndpoint:
      overrides.mcpEndpoint ??
      (isCloud
        ? cloud.mcpEndpoint
        : deriveSelfHostedEndpoint(apiEndpoint, 'mcp')),
    wsEndpoint:
      overrides.wsEndpoint ??
      (isCloud
        ? cloud.wsEndpoint
        : deriveSelfHostedEndpoint(apiEndpoint, 'ws')),
  };
}
