'use client';

import { isDesktopClient } from '@genfeedai/config/deployment';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import { useMounted } from '@hooks/utils/use-mounted/use-mounted';

/**
 * The `apps/app/public/` copy of the icon exists only for the desktop build:
 * the shell bundles it so the logo renders offline. Every web surface loads
 * the brand mark from the CDN — websites other than app.genfeed.ai don't ship
 * the file, so a local path 404s there.
 */
const DESKTOP_LOGO_URL = '/genfeed-icon.svg';
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
