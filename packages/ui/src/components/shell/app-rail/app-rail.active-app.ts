import type { AppRailItemConfig } from '@genfeedai/contracts/interfaces/ui/app-rail.interface';

/**
 * Path matching only, kept free of the icon-bearing registry so code that runs
 * on every route (analytics) can resolve the active app without pulling icons
 * into first-load JavaScript.
 */
export type AppRailPathRoots = Pick<
  AppRailItemConfig,
  'activePathRoots' | 'id'
>;

function normalizePath(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  const [pathname] = path.split('?', 1);
  const normalizedPathname = pathname.replace(/\/+$/, '');

  return normalizedPathname || '/';
}

/**
 * Strip tenant scope so matching is product-root based, like sidebar menus:
 * `/acme/default/storyboard` → `/storyboard`
 * `/acme/~/settings/brands` → `/settings/brands`
 * `/admin/users` → `/admin/users`
 */
function extractProductPath(pathname: string): string {
  const normalized = normalizePath(pathname);
  if (!normalized) {
    return '/';
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    return '/';
  }

  // Global / personal (no org prefix)
  if (
    parts[0] === 'admin' ||
    parts[0] === 'settings' ||
    parts[0] === 'connect' ||
    parts[0] === 'login' ||
    parts[0] === 'sign-up' ||
    parts[0] === 'onboarding'
  ) {
    return `/${parts.join('/')}`;
  }

  // `/:orgSlug/~/:rest*` or `/:orgSlug/:brandSlug/:rest*`
  if (parts.length >= 2) {
    const rest = parts.slice(2);
    return rest.length > 0 ? `/${rest.join('/')}` : '/';
  }

  return `/${parts.join('/')}`;
}

function scoreActivePathRoot(productPath: string, root: string): number {
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot) {
    return 0;
  }

  if (productPath === normalizedRoot) {
    return normalizedRoot.length + 1000;
  }

  if (productPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedRoot.length;
  }

  return 0;
}

/**
 * Highlight like a menu item: the app whose product root owns the current path.
 * No fallback to a default app — settings / unknown surfaces stay unselected.
 */
export function getActiveAppId(
  apps: readonly AppRailPathRoots[],
  currentPath?: string,
): AppRailItemConfig['id'] | undefined {
  const productPath = extractProductPath(currentPath ?? '');
  if (!productPath || productPath === '/') {
    return undefined;
  }

  let activeAppId: AppRailItemConfig['id'] | undefined;
  let activeScore = 0;

  for (const app of apps) {
    for (const root of app.activePathRoots) {
      const score = scoreActivePathRoot(productPath, root);
      if (score > activeScore) {
        activeAppId = app.id;
        activeScore = score;
      }
    }
  }

  return activeAppId;
}
