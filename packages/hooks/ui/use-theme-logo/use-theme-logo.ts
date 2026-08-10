'use client';

import { useMounted } from '@hooks/utils/use-mounted/use-mounted';

const GENFEED_LOGO_URL = '/genfeed-icon.svg';

/**
 * Custom hook to get the logo URL
 * Returns empty string until mounted (for SSR hydration)
 */
export function useThemeLogo(): string {
  const isMounted = useMounted();

  if (!isMounted) {
    return '';
  }

  return GENFEED_LOGO_URL;
}
