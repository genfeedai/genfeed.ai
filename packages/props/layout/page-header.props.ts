import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  backLabel?: string;
  backRoute?: string;
  onBack?: () => void;
  title: string;
  description?: string;
  icon?: IconComponent;
  actions?: ReactNode;
  className?: string;
}
