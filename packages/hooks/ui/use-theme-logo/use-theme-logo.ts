'use client';

import { isDesktopClient } from '@genfeedai/config/deployment';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import { useMounted } from '@hooks/utils/use-mounted/use-mounted';

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

/**
 * Custom hook to get the logo URL
 * Returns empty string until mounted (for SSR hydration)
 */
export function useThemeLogo(): string {
  const isMounted = useMounted();

  if (!isMounted) {
    return '';
  }

  return isDesktopClient() ? DESKTOP_LOGO_URL : WEB_LOGO_URL;
}
