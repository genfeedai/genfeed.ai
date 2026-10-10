import type { ReactNode } from 'react';

export interface SubscriptionGuardProps {
  children: ReactNode;
}

export interface SubscriptionRequiredStateProps {
  message: string;
  manageHref: string;
  manageLabel: string;
}
