import type { OverviewCard } from '@genfeedai/interfaces/ui/overview-card.interface';
import type { ComponentType, ReactNode } from 'react';

export interface OverviewContentProps {
  label?: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  cards?: OverviewCard[];
  actionsTitle?: string;
  header?: ReactNode;
  children?: ReactNode;
}
