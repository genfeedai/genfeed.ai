/**
 * The inspector docks beside the grid from `lg` up. Narrower than that the grid
 * needs the full width, so the same rail is presented as a sheet instead of
 * being hidden — an asset you selected always tells you what it is.
 */
export const INSPECTOR_DOCKED_MEDIA_QUERY = '(min-width: 1024px)';

function getMediaQueryList(): MediaQueryList | null {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return null;
  }

  return window.matchMedia(INSPECTOR_DOCKED_MEDIA_QUERY);
}

/**
 * Whether the viewport is wide enough to dock the inspector. Server renders and
 * environments without `matchMedia` report `false`, which resolves to the sheet
 * — a presentation that works at any width.
 */
export function getIsInspectorDocked(): boolean {
  return getMediaQueryList()?.matches ?? false;
}

export function subscribeInspectorDocked(listener: () => void): () => void {
  const mediaQuery = getMediaQueryList();

  if (!mediaQuery) {
    return () => undefined;
  }

  mediaQuery.addEventListener('change', listener);

  return () => mediaQuery.removeEventListener('change', listener);
}
