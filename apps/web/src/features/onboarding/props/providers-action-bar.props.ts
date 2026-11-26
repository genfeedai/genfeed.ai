import type { OnboardingAccessMode } from '@genfeedai/contracts/interfaces';
import type { MouseEvent } from 'react';

export type ProvidersAccessSurface = 'saas' | 'self-hosted';

export interface ProvidersActionBarProps {
  loading: boolean;
  pendingMode: OnboardingAccessMode | null;
  selectedMode: OnboardingAccessMode | null;
  surface: ProvidersAccessSurface;
  onByokClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onServerContinue: () => void;
  onCloudContinue: () => void;
  onBack: () => void;
}
