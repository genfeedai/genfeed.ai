import type { Brand } from '@genfeedai/models/organization/brand.model';
import type { ReactNode } from 'react';

export interface OrgLandingBrandItemProps {
  brand: Brand;
  href: string;
}

export interface OrgLandingBrandLogoProps {
  brand: Brand;
  className?: string;
}

export interface OrgLandingBrandFactsProps {
  brand: Brand;
  className?: string;
}

/** One known fact on a brand's fact line. */
export interface OrgLandingBrandFact {
  id: string;
  node: ReactNode;
}
