import type { ComponentType, ReactNode } from 'react';
import type { IconBaseProps } from 'react-icons';

export interface PageLayoutProps {
  children: ReactNode;
  badge?: string;
  badgeIcon?: ComponentType<IconBaseProps>;
  description?: string;
  heroActions?: ReactNode;
  heroDetails?: ReactNode;
  heroProof?: ReactNode;
  heroVisual?: ReactNode;
  showFooter?: boolean;
  title: ReactNode;
  variant?: 'poster' | 'proof';
}

export interface TrainingPageProps {
  params: Promise<{ id: string }>;
}
