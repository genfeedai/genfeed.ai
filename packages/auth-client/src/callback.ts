import { isUserFacingAppPathname } from '@genfeedai/contracts/constants';

const CALLBACK_RESOLUTION_ORIGIN = 'https://auth-callback.invalid';
const DESKTOP_CALLBACK_PROTOCOL = 'genfeedai-desktop:';
const DESKTOP_CALLBACK_HOST = 'auth';
const WEB_CALLBACK_PATH = '/';
const WEB_CONTINUATION_PARAM = 'callbackUrl';

function isDesktopAuthCallback(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === DESKTOP_CALLBACK_PROTOCOL &&
      parsed.hostname === DESKTOP_CALLBACK_HOST
    );
  } catch {
    return false;
  }
}

/** Resolve untrusted callback input into a product continuation or deep link. */
export function resolveAuthContinuation(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (isDesktopAuthCallback(value)) {
    return value;
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  try {
    const parsed = new URL(value, CALLBACK_RESOLUTION_ORIGIN);
    if (
      parsed.origin !== CALLBACK_RESOLUTION_ORIGIN ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    if (!isUserFacingAppPathname(parsed.pathname)) {
      return null;
    }

    if (
      parsed.pathname === WEB_CALLBACK_PATH &&
      (parsed.search.length > 0 || parsed.hash.length > 0)
    ) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/**
 * Build Better Auth's post-login URL. Web authentication always returns to the
 * root; an optional validated product continuation is data on that fixed URL.
 */
export function buildBrowserAuthCallbackURL(
  continuation: string,
  origin: string,
): string {
  const resolved = resolveAuthContinuation(continuation);
  if (resolved && isDesktopAuthCallback(resolved)) {
    return resolved;
  }

  const callback = new URL(WEB_CALLBACK_PATH, origin);
  if (resolved && resolved !== WEB_CALLBACK_PATH) {
    callback.searchParams.set(WEB_CONTINUATION_PARAM, resolved);
  }

  return callback.toString();
}

/** Validate the fixed browser callback contract at server-side auth boundaries. */
export function isSafeBrowserAuthCallbackURL(
  value: string,
  appOrigin?: string,
  allowedPathnames: readonly string[] = [WEB_CALLBACK_PATH],
): boolean {
  if (isDesktopAuthCallback(value)) {
    return true;
  }

  const isRelative = value.startsWith('/') && !value.startsWith('//');
  if (!isRelative && !appOrigin) {
    return false;
  }

  try {
    const base = appOrigin ?? CALLBACK_RESOLUTION_ORIGIN;
    const baseOrigin = new URL(base).origin;
    const parsed = new URL(value, base);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !allowedPathnames.includes(parsed.pathname) ||
      parsed.hash ||
      parsed.username ||
      parsed.password ||
      (isRelative && parsed.origin !== baseOrigin) ||
      (!isRelative && parsed.origin !== baseOrigin)
    ) {
      return false;
    }

    const keys = [...parsed.searchParams.keys()];
    if (keys.some((key) => key !== WEB_CONTINUATION_PARAM)) {
      return false;
    }

    const continuations = parsed.searchParams.getAll(WEB_CONTINUATION_PARAM);
    return (
      continuations.length === 0 ||
      (continuations.length === 1 &&
        resolveAuthContinuation(continuations[0] ?? null)?.startsWith('/') ===
          true)
    );
  } catch {
    return false;
  }
}
