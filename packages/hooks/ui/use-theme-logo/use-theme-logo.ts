'use client';

import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { useMounted } from '@hooks/utils/use-mounted/use-mounted';

const DESKTOP_LOGO_URL = '/genfeed-icon.svg';

/**
 * Custom hook to get the logo URL
 * Returns empty string until mounted (for SSR hydration)
 */
export function useThemeLogo(): string {
  const isMounted = useMounted();

  if (!isMounted) {
    return '';
  }

  if (process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1') {
    return DESKTOP_LOGO_URL;
  }

  return EnvironmentService.logoURL;
}
