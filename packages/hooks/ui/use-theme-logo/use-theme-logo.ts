'use client';

import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { useMounted } from '@hooks/utils/use-mounted/use-mounted';

/**
 * Custom hook to get the logo URL
 * Returns empty string until mounted (for SSR hydration)
 */
export function useThemeLogo(): string {
  const isMounted = useMounted();

  if (!isMounted) {
    return '';
  }

  return EnvironmentService.logoURL;
}
