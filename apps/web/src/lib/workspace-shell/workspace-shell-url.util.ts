const INTERNAL_ORIGIN = 'https://workspace.genfeed.invalid';

export function parseInternalHref(href: string): URL | null {
  try {
    const url = new URL(href, INTERNAL_ORIGIN);
    return url.origin === INTERNAL_ORIGIN ? url : null;
  } catch {
    return null;
  }
}

export function toRelativeHref(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}
