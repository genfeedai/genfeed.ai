'use client';

import { isDesktopClient } from '@genfeedai/config/deployment';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import { useSyncExternalStore } from 'react';

/**
 * The CDN object is the canonical brand mark. `apps/app/public/logo.svg` is a
 * byte-for-byte mirror of it, committed only because the desktop build needs a
 * local file: `apps/desktop/app/scripts/generate-macos-icon.sh` rasterizes it
 * into the `.icns`, and the shell serves it so the logo renders offline. Both
 * paths therefore end in the same filename on purpose — refresh the mirror from
 * the CDN, never edit it in place. Web surfaces always read the CDN directly;
 * no site other than app.genfeed.ai ships the file, so a local path 404s there.
 */
const DESKTOP_LOGO_URL = '/logo.svg';
const WEB_LOGO_URL = cdnAsset('/assets/branding/logo.svg');

const subscribeToClientSurface = () => () => {};
const getLogoSnapshot = () =>
  isDesktopClient() ? DESKTOP_LOGO_URL : WEB_LOGO_URL;
/**
 * The desktop shell is only knowable after hydration, so the server snapshot is
 * the web mark. Returning it (rather than an empty string) keeps the logo in the
 * server HTML: on auth screens it is the first paint, and blanking it used to
 * both delay paint and shift the heading once hydration filled the gap. React
 * re-renders with the desktop path after hydration, with no mismatch.
 */
const getLogoServerSnapshot = () => WEB_LOGO_URL;

/**
 * Custom hook to get the logo URL for the current client surface.
 */
export function useThemeLogo(): string {
  return useSyncExternalStore(
    subscribeToClientSurface,
    getLogoSnapshot,
    getLogoServerSnapshot,
  );
}
