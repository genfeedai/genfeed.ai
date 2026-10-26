/** Canonical deployment and client-surface detection. */

export type Deployment = 'cloud' | 'self-hosted';
export type ClientSurface = 'desktop' | 'web';

const ENABLED_ENV_FLAG_VALUES = new Set(['1', 'true']);

/**
 * Env vars that may hold a public Genfeed Cloud URL. Used server-side (and in
 * SSR) when the browser hostname is unavailable. Internal Cloud Map hosts
 * (`*.genfeed.internal`) are not `*.genfeed.ai` and never match.
 */
const HOSTED_GENFEED_URL_ENV_KEYS = [
  'GENFEEDAI_API_PUBLIC_URL',
  'GENFEEDAI_APP_URL',
  'GENFEEDAI_MCP_PUBLIC_URL',
  'NEXT_PUBLIC_API_ENDPOINT',
  'NEXT_PUBLIC_APPS_APP_ENDPOINT',
  'NEXT_PUBLIC_APPS_ADMIN_ENDPOINT',
  'NEXT_PUBLIC_APPS_WEBSITE_ENDPOINT',
  'NEXT_PUBLIC_MCP_ENDPOINT',
] as const;

/**
 * Hosted-URL keys that name the service's *own* origin. The API and MCP
 * endpoints are excluded because a browser test build legitimately points them
 * at the hosted API while the app itself runs on localhost.
 */
const OWN_ORIGIN_URL_ENV_KEYS = HOSTED_GENFEED_URL_ENV_KEYS.filter(
  (key) =>
    key !== 'NEXT_PUBLIC_API_ENDPOINT' && key !== 'NEXT_PUBLIC_MCP_ENDPOINT',
);

/**
 * TEST-ONLY. Forces the deployment axis (`cloud` | `self-hosted`) for a
 * production build that runs on a non-`*.genfeed.ai` origin, e.g. the
 * Playwright Community and Cloud tiers (`next build` on localhost against the
 * hosted API). It is ignored whenever the origin is `*.genfeed.ai`, so it can
 * never change what the hosted product resolves to. Never set it in a deploy.
 */
export const E2E_DEPLOYMENT_OVERRIDE_ENV_KEY =
  'NEXT_PUBLIC_GENFEED_E2E_DEPLOYMENT';

/**
 * Read one deployment env var from `process.env`. Next inlines `NEXT_PUBLIC_*`
 * values into the browser bundle only for literal `process.env.NAME` reads, and
 * `process.env[key]` is undefined there. `NODE_ENV`, the two non-production
 * cloud flags and the test-only override are read literally so the browser
 * resolves them exactly as the server does. The hosted-URL keys keep their dynamic read
 * on purpose: in the browser the hostname rule decides, and inlining the URLs
 * would make any build whose API endpoint is on `*.genfeed.ai` Cloud there.
 */
function readDeploymentEnv(key: string): string | undefined {
  switch (key) {
    case 'GENFEED_CLOUD':
      return process.env.GENFEED_CLOUD;
    case 'NEXT_PUBLIC_GENFEED_CLOUD':
      return process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    case 'NEXT_PUBLIC_GENFEED_E2E_DEPLOYMENT':
      return process.env.NEXT_PUBLIC_GENFEED_E2E_DEPLOYMENT;
    case 'NODE_ENV':
      return process.env.NODE_ENV;
    default:
      return process.env[key];
  }
}

/**
 * Resolve a boolean environment flag consistently across server and browser
 * bundles. Whitespace and casing are ignored; only `1` and `true` enable it.
 */
export function envFlag(value: string | undefined): boolean {
  return ENABLED_ENV_FLAG_VALUES.has(value?.trim().toLowerCase() ?? '');
}

/**
 * True when `hostname` is the managed Genfeed Cloud domain:
 * `genfeed.ai`, `www.genfeed.ai`, or any `*.genfeed.ai`
 * (app / api / admin / mcp / cdn / staging / …).
 *
 * Local Portless (`*.genfeed.localhost`) is **not** SaaS by hostname alone —
 * outside production, set `GENFEED_CLOUD` / `NEXT_PUBLIC_GENFEED_CLOUD` for
 * local cloud mode.
 */
export function isHostedGenfeedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) {
    return false;
  }

  return host === 'genfeed.ai' || host.endsWith('.genfeed.ai');
}

/** Extract a hostname from a URL or host:port string; undefined if unusable. */
export function hostnameFromUrl(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) {
    return undefined;
  }

  try {
    const withProtocol = raw.includes('://') ? raw : `https://${raw}`;
    const { hostname } = new URL(withProtocol);
    return hostname || undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when any configured public Genfeed URL points at `*.genfeed.ai`.
 * Shared by API and Next — same rule both sides.
 */
export type EnvValueReader = (key: string) => string | undefined;

export function isHostedGenfeedFromReader(
  readEnv: EnvValueReader,
  keys: readonly string[] = HOSTED_GENFEED_URL_ENV_KEYS,
): boolean {
  for (const key of keys) {
    const hostname = hostnameFromUrl(readEnv(key));
    if (hostname && isHostedGenfeedHostname(hostname)) {
      return true;
    }
  }

  return false;
}

export function isHostedGenfeedFromEnv(): boolean {
  return isHostedGenfeedFromReader((key) => process.env[key]);
}

/**
 * True when the current browser tab is on `*.genfeed.ai`.
 * No-op on the server / during SSR without a window.
 */
export function isHostedGenfeedFromBrowser(): boolean {
  if (typeof globalThis === 'undefined') {
    return false;
  }

  const location = (
    globalThis as typeof globalThis & {
      location?: { hostname?: string };
    }
  ).location;

  const hostname = location?.hostname;
  return typeof hostname === 'string' && isHostedGenfeedHostname(hostname);
}

/**
 * Managed Genfeed Cloud by domain — frontend **and** backend.
 * `*.genfeed.ai` is SaaS; env flags are the override for local / self-host.
 */
export function isHostedGenfeedCloud(): boolean {
  return isHostedGenfeedFromBrowser() || isHostedGenfeedFromEnv();
}

/**
 * Production resolves from the `*.genfeed.ai` domain alone, so nobody can
 * flip a hosted deployment by setting a flag. The only exception is the
 * test-only override on a non-`*.genfeed.ai` origin.
 */
function getProductionDeploymentFromReader(
  readEnv: EnvValueReader,
): Deployment {
  if (isHostedGenfeedFromReader(readEnv, OWN_ORIGIN_URL_ENV_KEYS)) {
    return 'cloud';
  }

  const override = readEnv(E2E_DEPLOYMENT_OVERRIDE_ENV_KEY)?.trim();
  if (override === 'cloud' || override === 'self-hosted') {
    return override;
  }

  return isHostedGenfeedFromReader(readEnv) ? 'cloud' : 'self-hosted';
}

/**
 * Resolve the backend deployment axis. In production only the `*.genfeed.ai`
 * domain decides; the `GENFEED_CLOUD` flags are ignored. Outside production
 * (local, Portless, tests) an explicit flag wins and the domain is the
 * fallback.
 */
export function getDeploymentFromReader(readEnv: EnvValueReader): Deployment {
  if (readEnv('NODE_ENV')?.trim() === 'production') {
    return getProductionDeploymentFromReader(readEnv);
  }

  const serverFlag = readEnv('GENFEED_CLOUD')?.trim();
  const publicFlag = readEnv('NEXT_PUBLIC_GENFEED_CLOUD')?.trim();
  const explicitFlag = serverFlag || publicFlag;

  if (explicitFlag) {
    return envFlag(explicitFlag) ? 'cloud' : 'self-hosted';
  }

  // A missing GENFEED_CLOUD on api.genfeed.ai / app.genfeed.ai must never drop
  // billing (or UI) into community/OSS mode. Browser hostname is not used here
  // so Nest/libs can pass ConfigService instead of reading process.env.
  return isHostedGenfeedFromReader(readEnv) ? 'cloud' : 'self-hosted';
}

/**
 * True for a production process that resolves to Cloud. Takes a reader that
 * returns unknown values (e.g. a Nest `ConfigService`); non-strings are
 * treated as unset.
 */
export function isProductionCloudFromReader(
  read: (key: string) => unknown,
): boolean {
  const readEnv: EnvValueReader = (key) => {
    const value = read(key);
    return typeof value === 'string' ? value : undefined;
  };

  return (
    readEnv('NODE_ENV')?.trim() === 'production' &&
    getDeploymentFromReader(readEnv) === 'cloud'
  );
}

/** An Express `trust proxy` value: on/off, a hop count, or proxy addresses/subnets. */
export type TrustProxySetting = boolean | number | string[];

/**
 * Parse a `TRUST_PROXY` value with Express semantics: `true` / `false`, a hop
 * count (`1`), or a comma-separated list of proxy addresses, subnets, or the
 * Express ranges `loopback`, `linklocal` and `uniquelocal`.
 */
export function parseTrustProxy(value: string): TrustProxySetting {
  const raw = value.trim();
  const lowered = raw.toLowerCase();

  if (lowered === 'true') {
    return true;
  }
  if (lowered === '' || lowered === 'false') {
    return false;
  }
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Which forwarding proxies the server trusts to report the client address.
 * `TRUST_PROXY` wins when set. Otherwise Cloud trusts exactly one hop (the
 * load balancer is the only path in) and self-host trusts none, because its
 * ports may be reachable directly and any client can send `X-Forwarded-For`.
 */
export function resolveTrustProxyFromReader(
  readEnv: EnvValueReader,
): TrustProxySetting {
  const configured = readEnv('TRUST_PROXY')?.trim();
  if (configured) {
    return parseTrustProxy(configured);
  }

  return getDeploymentFromReader(readEnv) === 'cloud' ? 1 : false;
}

export function getDeployment(): Deployment {
  // `*.genfeed.ai` is Cloud on the client exactly as the URL keys make it Cloud
  // on the server. Outside production an explicit flag still wins.
  if (isHostedGenfeedFromBrowser()) {
    const hasExplicitFlag = Boolean(
      readDeploymentEnv('GENFEED_CLOUD')?.trim() ||
        readDeploymentEnv('NEXT_PUBLIC_GENFEED_CLOUD')?.trim(),
    );
    if (
      readDeploymentEnv('NODE_ENV')?.trim() === 'production' ||
      !hasExplicitFlag
    ) {
      return 'cloud';
    }
  }

  return getDeploymentFromReader(readDeploymentEnv);
}

/**
 * True only for the bundled desktop build, where the server renders the
 * desktop surface too. The hosted studio opened inside the desktop shell learns
 * it is desktop from the runtime config script, which the server render never
 * sees — so this is the value hydration must start from.
 */
export function isDesktopShellBuild(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_DESKTOP_SHELL);
}

/** Resolve the client-surface axis independently from the deployment. */
export function getClientSurface(): ClientSurface {
  if (isDesktopShellBuild()) {
    return 'desktop';
  }

  const runtimeSurface = (
    globalThis as typeof globalThis & {
      __GENFEED_RUNTIME_CONFIG__?: { clientSurface?: ClientSurface };
    }
  ).__GENFEED_RUNTIME_CONFIG__?.clientSurface;

  return runtimeSurface === 'desktop' ? 'desktop' : 'web';
}

export function isCloudDeployment(): boolean {
  return getDeployment() === 'cloud';
}

export function isSelfHostedDeployment(): boolean {
  return getDeployment() === 'self-hosted';
}

export function isDesktopClient(): boolean {
  return getClientSurface() === 'desktop';
}

export function isSaaS(): boolean {
  return isCloudDeployment() && !isDesktopClient();
}

export function isCommunity(): boolean {
  return isSelfHostedDeployment() && !isDesktopClient();
}

/**
 * Whether onboarding is the single `/onboarding` page: the operator links a
 * website, reviews the first drafts and is done. Every surface but the desktop
 * client works this way; desktop keeps the classic providers/summary wizard
 * after the brand step.
 */
export function hasSingleStepOnboarding(): boolean {
  return !isDesktopClient();
}
