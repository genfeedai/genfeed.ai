import type { PlatformFlagKey } from '@genfeedai/contracts/constants';
import type { ReactNode } from 'react';

export interface FeatureGateProps {
  flagKey: PlatformFlagKey;
  children: ReactNode;
}
