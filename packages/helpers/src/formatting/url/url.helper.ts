export function ensureLeadingSlash(path: string): string {
  if (!path) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

export function removeTrailingSlash(path: string): string {
  if (!path || path === '/') {
    return '';
  }
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

export function joinUrlPaths(...segments: string[]): string {
  return segments
    .filter(Boolean)
    .map((segment, index) => {
      // Remove leading slash from non-first segments
      if (index > 0 && segment.startsWith('/')) {
        segment = segment.slice(1);
      }
      // Remove trailing slash from non-last segments
      if (index < segments.length - 1 && segment.endsWith('/')) {
        segment = segment.slice(0, -1);
      }
      return segment;
    })
    .join('/')
    .replace(/\/+/g, '/');
}

export function buildResourcePath(
  resourceId?: string,
  action?: string,
): string {
  const segments = [];

  if (resourceId) {
    segments.push(ensureLeadingSlash(resourceId));
  }

  if (action) {
    segments.push(action);
  }

  return segments.length > 0 ? joinUrlPaths(...segments) : '/';
}
