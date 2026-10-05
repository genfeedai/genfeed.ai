import { isUserFacingAppPathname } from '@genfeedai/contracts/constants';

/**
 * Where the desktop shell lands after a system-browser sign-in. The page that
 * started the sign-in (an OAuth consent request, for one) passes its product
 * path; anything off-origin or outside the user-facing app falls back to the
 * root, the same rule the web callback resolver applies (#6276).
 */
export function resolveDesktopAuthLandingUrl(
  appOrigin: string,
  continuation?: string | null,
): string {
  const root = new URL('/', appOrigin);
  if (!continuation?.startsWith('/') || continuation.startsWith('//')) {
    return root.toString();
  }

  try {
    const target = new URL(continuation, root);
    if (
      target.origin !== root.origin ||
      !isUserFacingAppPathname(target.pathname)
    ) {
      return root.toString();
    }
    return target.toString();
  } catch {
    return root.toString();
  }
}
