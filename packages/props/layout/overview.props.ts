import type { OverviewCard } from '@genfeedai/contracts/interfaces/ui/overview-card.interface';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

export interface OverviewContentProps {
  label?: string;
  description?: string;
  icon?: IconComponent;
  cards?: OverviewCard[];
  actionsTitle?: string;
  header?: ReactNode;
  children?: ReactNode;
}
