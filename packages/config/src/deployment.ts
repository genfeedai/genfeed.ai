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
 * set `GENFEED_CLOUD` / `NEXT_PUBLIC_GENFEED_CLOUD` for local cloud mode.
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
export function isHostedGenfeedFromEnv(): boolean {
  for (const key of HOSTED_GENFEED_URL_ENV_KEYS) {
    const hostname = hostnameFromUrl(process.env[key]);
    if (hostname && isHostedGenfeedHostname(hostname)) {
      return true;
    }
  }

  return false;
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
 * @deprecated Prefer {@link isHostedGenfeedCloud}. Kept as an alias so older
 * call sites and the billing PR diff stay greppable.
 */
export function isHostedGenfeedApi(): boolean {
  return isHostedGenfeedCloud();
}

/** Resolve the backend deployment axis. Explicit flags win; domain is the safety net. */
export function getDeployment(): Deployment {
  const serverFlag = process.env.GENFEED_CLOUD?.trim();
  const publicFlag = process.env.NEXT_PUBLIC_GENFEED_CLOUD?.trim();
  const explicitFlag = serverFlag || publicFlag;

  if (explicitFlag) {
    return envFlag(explicitFlag) ? 'cloud' : 'self-hosted';
  }

  // Domain is the product source of truth for hosted SaaS. A missing
  // GENFEED_CLOUD on api.genfeed.ai / app.genfeed.ai must never drop billing
  // (or UI) into community/OSS mode.
  if (isHostedGenfeedCloud()) {
    return 'cloud';
  }

  return 'self-hosted';
}

/** Resolve the client-surface axis independently from the deployment. */
export function getClientSurface(): ClientSurface {
  if (envFlag(process.env.NEXT_PUBLIC_DESKTOP_SHELL)) {
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
 * Deployment modes whose onboarding runs inside the agent workspace.
 * SaaS cut over in #1726 and Community in #1835; the desktop client keeps the
 * classic form wizard until #2380, so the wizard implementation stays in place.
 */
export function hasAgentFirstOnboarding(): boolean {
  return !isDesktopClient();
}
