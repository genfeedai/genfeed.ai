const PROTOCOL_RELATIVE_PATTERN = /^\/\//;
const BACKSLASH_PATTERN = /\\/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const MAX_CONTROL_CHARACTER_CODE = 0x1f;
const DELETE_CHARACTER_CODE = 0x7f;

/** Whether `value` carries a URI scheme (`:`) before its first `/`. */
function hasSchemeBeforeFirstSlash(value: string): boolean {
  const colonIndex = value.indexOf(':');

  if (colonIndex === -1) {
    return false;
  }

  const slashIndex = value.indexOf('/');
  return slashIndex === -1 || colonIndex < slashIndex;
}

/** Whether `value` contains an ASCII control character (including DEL). */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const characterCode = value.charCodeAt(index);

    if (
      characterCode <= MAX_CONTROL_CHARACTER_CODE ||
      characterCode === DELETE_CHARACTER_CODE
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve a `return_to`-style query value into a same-origin relative path.
 *
 * Only a clean, single-slash-prefixed relative path is honoured. Anything
 * else — an absolute URL, a protocol-relative URL (`//host`), a
 * backslash-prefixed path (browsers resolve `/\host` as protocol-relative),
 * a value carrying a URI scheme, or a value containing a backslash or a
 * control character — falls back to `defaultPath`, so callers can never turn
 * an authenticated redirect into an open redirect. The query string of an
 * accepted path is preserved unchanged.
 */
export function resolveSameOriginReturnTo(
  returnTo: string | null | undefined,
  defaultPath: string,
): string {
  if (!returnTo) {
    return defaultPath;
  }

  const isSameOriginPath =
    returnTo.startsWith('/') &&
    !PROTOCOL_RELATIVE_PATTERN.test(returnTo) &&
    !BACKSLASH_PATTERN.test(returnTo) &&
    !hasControlCharacter(returnTo) &&
    !SCHEME_PATTERN.test(returnTo) &&
    !hasSchemeBeforeFirstSlash(returnTo);

  return isSameOriginPath ? returnTo : defaultPath;
}
