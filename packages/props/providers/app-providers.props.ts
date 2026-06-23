import type { ReactNode } from 'react';

export interface AppProvidersProps {
  children: ReactNode;
  initialTheme: string;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  googleAnalyticsId?: string;
  includeLazyModalErrorDebug?: boolean;
  includeSpeedInsights?: boolean;
  includeToaster?: boolean;
  includeVercelAnalytics?: boolean;
  storageKey?: string;
}
