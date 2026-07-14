const DEFAULT_API_ENDPOINT = 'http://genfeed.localhost:3010/v1';

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Canonical API endpoint used by mocked local Playwright projects. */
export const playwrightApiEndpoint = stripTrailingSlashes(
  process.env.NEXT_PUBLIC_API_ENDPOINT || DEFAULT_API_ENDPOINT,
);

/** API origin used to register route interceptors without duplicating hosts. */
export const playwrightApiOrigin = (() => {
  try {
    return new URL(playwrightApiEndpoint).origin;
  } catch {
    return 'http://genfeed.localhost:3010';
  }
})();

export const playwrightApiHostname = (() => {
  try {
    return new URL(playwrightApiEndpoint).hostname;
  } catch {
    return 'genfeed.localhost';
  }
})();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createPlaywrightApiRoutePattern(pathPattern = '.+'): RegExp {
  return new RegExp(
    `${escapeRegExp(playwrightApiEndpoint)}/${pathPattern.replace(/^\/+/, '')}`,
  );
}
