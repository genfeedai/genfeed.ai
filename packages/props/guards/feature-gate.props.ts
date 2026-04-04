import type { ReactNode } from 'react';

export interface FeatureGateProps {
  flagKey: string;
  children: ReactNode;
}
