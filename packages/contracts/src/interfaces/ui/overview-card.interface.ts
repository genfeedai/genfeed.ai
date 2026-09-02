import type { ComponentType } from 'react';

export interface OverviewCard {
  id: string;
  label: string;
  description: string;
  cta: string;
  href?: string;
  onClick?: () => void;
  icon: ComponentType<{ className?: string }>;
  color?: string;
}

export interface OverviewContentProps {
  label: string;
  subtitle: string;
  cards: OverviewCard[];
}
