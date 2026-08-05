import type { ReactNode } from 'react';

export interface AppProvidersProps {
  children: ReactNode;
  initialTheme: string;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  includeLazyModalErrorDebug?: boolean;
  includeToaster?: boolean;
  storageKey?: string;
}
