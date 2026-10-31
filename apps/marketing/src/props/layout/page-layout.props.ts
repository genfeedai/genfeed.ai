import type { ReactNode } from 'react';

export interface PageLayoutProps {
  children: ReactNode;
  compact?: boolean;
  description?: string;
  heroActions?: ReactNode;
  heroDetails?: ReactNode;
  heroProof?: ReactNode;
  heroMedia?: ReactNode;
  heroVisual?: ReactNode;
  isHeroVisualStacked?: boolean;
  showFooter?: boolean;
  title: ReactNode;
  variant?: 'poster' | 'proof';
}

export interface TrainingPageProps {
  params: Promise<{ id: string }>;
}
