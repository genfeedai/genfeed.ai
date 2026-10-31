import type { LucideIcon } from 'lucide-react';

export interface OrganizationAutomationSurfaceLink {
  href: string;
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface OrganizationAutomationBrand {
  href: string;
  id: string;
  label: string;
  slug: string;
  totalCredentials: number;
  surfaces: OrganizationAutomationSurfaceLink[];
}

export interface OrganizationAutomationBrandCardProps {
  brand: OrganizationAutomationBrand;
}
