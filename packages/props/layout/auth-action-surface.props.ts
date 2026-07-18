import type { ReactNode } from 'react';

export interface AuthActionSurfaceProps {
  actions: ReactNode;
  className?: string;
  description: string;
  error?: ReactNode;
  footer?: ReactNode;
  supportingCopy?: ReactNode;
  title: string;
}
