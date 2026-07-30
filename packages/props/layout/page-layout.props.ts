import type { ComponentType, ReactNode, SVGProps } from 'react';

export interface PageLayoutProps {
  children: ReactNode;
  badge?: string;
  badgeIcon?: ComponentType<SVGProps<SVGSVGElement>>;
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
