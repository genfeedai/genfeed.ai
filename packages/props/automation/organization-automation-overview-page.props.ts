import type { LucideIcon } from 'lucide-react';

export interface OrganizationAutomationBrand {
  href: string;
  id: string;
  label: string;
  surfaces: {
    href: string;
    label: string;
    icon: LucideIcon;
  }[];
}

export interface OrganizationAutomationBrandCardProps {
  brand: OrganizationAutomationBrand;
}
