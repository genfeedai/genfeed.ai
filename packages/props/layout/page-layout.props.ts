import type { ComponentType, ReactNode } from 'react';
export interface PageLayoutProps {
  children: ReactNode;
  badge?: string;
  badgeIcon?: ComponentType<IconBaseProps>;
  compact?: boolean;
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
