import {
  APP_ROUTE_PREFIXES,
  isPersonalSettingsPath,
  STUDIO_APP_ROUTE_PREFIXES,
} from '@genfeedai/contracts/constants';

const BRAND_SCOPED_PREFIXES = [
  APP_ROUTE_PREFIXES.ANALYTICS.slice(1),
  APP_ROUTE_PREFIXES.AGENT.slice(1),
  APP_ROUTE_PREFIXES.LIBRARY.slice(1),
  APP_ROUTE_PREFIXES.AUTOMATION.slice(1),
  APP_ROUTE_PREFIXES.OVERVIEW.slice(1),
  APP_ROUTE_PREFIXES.PUBLISHING.slice(1),
  APP_ROUTE_PREFIXES.DISCOVERY.slice(1),
  ...STUDIO_APP_ROUTE_PREFIXES.map((prefix) => prefix.slice(1)),
  APP_ROUTE_PREFIXES.WORKSPACE.slice(1),
] as const;

export const ORG_SCOPED_PREFIXES = ['settings', 'connectors'] as const;

export function getTopLevelSegment(pathname: string): string | null {
  const [segment] = pathname.split('/').filter(Boolean);
  return segment ?? null;
}

export function isBareProtectedPath(pathname: string): boolean {
  const topLevelSegment = getTopLevelSegment(pathname);

  if (!topLevelSegment) {
    return false;
  }

  if (topLevelSegment === 'settings') {
    return !isPersonalSettingsPath(pathname);
  }

  return (
    BRAND_SCOPED_PREFIXES.includes(
      topLevelSegment as (typeof BRAND_SCOPED_PREFIXES)[number],
    ) ||
    ORG_SCOPED_PREFIXES.includes(
      topLevelSegment as (typeof ORG_SCOPED_PREFIXES)[number],
    )
  );
}

export function isSeededWorkspaceEntrypoint(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/settings' ||
    isBareProtectedPath(pathname)
  );
}

export function getApiNamespacePoisonedProtectedPath(
  pathname: string,
): string | null {
  const [namespace, staleBrandSlug, ...rest] = pathname
    .split('/')
    .filter(Boolean);
  if (namespace !== 'api' || !staleBrandSlug || rest.length === 0) {
    return null;
  }

  const protectedPath = `/${rest.join('/')}`;
  return isBareProtectedPath(protectedPath) ? protectedPath : null;
}
