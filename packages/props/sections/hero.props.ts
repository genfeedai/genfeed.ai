import type { ReactNode } from 'react';

export type HeroVariant = 'default' | 'centered' | 'split';

export interface HeroCtaProps {
  /** Button label */
  label: string;
  /** Button href */
  href: string;
  /** Whether to open in new tab */
  external?: boolean;
}

export interface HeroSectionProps {
  /** Optional badge/eyebrow text */
  badge?: string;
  /** Main headline */
  title: ReactNode;
  /** Supporting description */
  description?: string;
  /** Primary CTA button */
  primaryCta?: HeroCtaProps;
  /** Secondary CTA button */
  secondaryCta?: HeroCtaProps;
  /** Showcase element (image, video, stats grid, etc.) */
  showcase?: ReactNode;
  /** Layout variant */
  variant?: HeroVariant;
  /** Additional CSS classes */
  className?: string;
}
