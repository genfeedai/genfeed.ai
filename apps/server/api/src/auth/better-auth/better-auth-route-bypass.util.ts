const LEGACY_NEST_AUTH_ROUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  GET: new Set(['/bootstrap', '/bootstrap/overview', '/whoami']),
  HEAD: new Set(['/bootstrap', '/bootstrap/overview', '/whoami']),
  POST: new Set(['/cli/token', '/desktop/authorize', '/desktop/exchange']),
};

function normalizeMountedPath(path: string): string {
  const [pathWithoutQuery = ''] = path.split('?', 1);
  const normalizedPath = pathWithoutQuery.startsWith('/')
    ? pathWithoutQuery
    : `/${pathWithoutQuery}`;

  if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
    return normalizedPath.slice(0, -1);
  }

  return normalizedPath;
}

export function shouldBypassBetterAuthHandler(
  method: string,
  mountedPath: string,
): boolean {
  const allowedPaths = LEGACY_NEST_AUTH_ROUTES[method.toUpperCase()];
  if (!allowedPaths) {
    return false;
  }

  return allowedPaths.has(normalizeMountedPath(mountedPath));
}
