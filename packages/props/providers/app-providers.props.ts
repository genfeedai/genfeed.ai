import type { ThemePreference } from '@genfeedai/contracts/constants';
import type { ReactNode } from 'react';

export interface AppProvidersProps {
  children: ReactNode;
  initialTheme: ThemePreference;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  includeLazyModalErrorDebug?: boolean;
  includeToaster?: boolean;
  nonce?: string;
  storageKey?: string;
}
