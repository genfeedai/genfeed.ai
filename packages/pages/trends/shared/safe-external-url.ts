/**
 * Validates that a value is a safe `http(s)` URL before it is used as a
 * link target or `window.open` destination. Shared by the Desk table/light
 * table views (formerly duplicated in the retired `following-page.tsx`).
 */
export function getSafeExternalUrl(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
