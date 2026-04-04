'use client';

import { useMounted } from '@hooks/utils/use-mounted/use-mounted';
import { EnvironmentService } from '@services/core/environment.service';

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
