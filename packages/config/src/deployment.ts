/** Canonical deployment and client-surface detection. */

export type Deployment = 'cloud' | 'self-hosted';
export type ClientSurface = 'desktop' | 'web';

const ENABLED_ENV_FLAG_VALUES = new Set(['1', 'true']);

/**
 * Resolve a boolean environment flag consistently across server and browser
 * bundles. Whitespace and casing are ignored; only `1` and `true` enable it.
 */
export function envFlag(value: string | undefined): boolean {
  return ENABLED_ENV_FLAG_VALUES.has(value?.trim().toLowerCase() ?? '');
}

/** Resolve the backend deployment axis. The server-only flag takes priority. */
export function getDeployment(): Deployment {
  return envFlag(
    process.env.GENFEED_CLOUD ?? process.env.NEXT_PUBLIC_GENFEED_CLOUD,
  )
    ? 'cloud'
    : 'self-hosted';
}

/** Resolve the client-surface axis independently from the deployment. */
export function getClientSurface(): ClientSurface {
  return envFlag(process.env.NEXT_PUBLIC_DESKTOP_SHELL) ? 'desktop' : 'web';
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
