const NON_APPLICATION_CALLBACK_PREFIXES = [
  '/api',
  '/v1',
  '/trpc',
  '/_next',
  '/serwist',
] as const;

/** Returns whether a post-auth pathname represents a user-facing app route. */
export function isApplicationAuthCallbackPathname(pathname: string): boolean {
  let normalizedPathname: string;
  try {
    normalizedPathname = decodeURIComponent(pathname).toLowerCase();
  } catch {
    return false;
  }

  return NON_APPLICATION_CALLBACK_PREFIXES.every(
    (prefix) =>
      normalizedPathname !== prefix &&
      !normalizedPathname.startsWith(`${prefix}/`),
  );
}
