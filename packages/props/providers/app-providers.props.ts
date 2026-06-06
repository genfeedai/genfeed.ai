import type { ReactNode } from 'react';

export interface AppProvidersProps<ClerkProps = unknown> {
  children: ReactNode;
  initialTheme: string;
  clerkProps?: ClerkProps;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  googleAnalyticsId?: string;
  includeLazyModalErrorDebug?: boolean;
  includeSpeedInsights?: boolean;
  includeToaster?: boolean;
  includeVercelAnalytics?: boolean;
  storageKey?: string;
}

export interface ClerkProviderWithThemeProps<ClerkProps = unknown> {
  children: ReactNode;
  clerkProps?: ClerkProps;
  hasMissingPublishableKeyBypass?: boolean;
}

export interface MaybeClerkProviderProps<ClerkProps = unknown> {
  children: ReactNode;
  clerkProps?: ClerkProps;
}
