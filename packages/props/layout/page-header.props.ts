import type { ComponentType, ReactNode } from 'react';

export interface PageHeaderProps {
  backLabel?: string;
  backRoute?: string;
  onBack?: () => void;
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  className?: string;
}
