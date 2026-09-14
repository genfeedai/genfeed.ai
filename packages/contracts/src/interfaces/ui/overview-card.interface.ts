import type { IconComponent } from '../../types/icon';

export interface OverviewCard {
  id: string;
  label: string;
  description: string;
  cta: string;
  href?: string;
  onClick?: () => void;
  icon: IconComponent;
  color?: string;
}

export interface OverviewContentProps {
  label: string;
  subtitle: string;
  cards: OverviewCard[];
}
