import type { OrganizationCategory } from '@genfeedai/contracts';

export interface BrandAccountTypeSelectorProps {
  accountType: OrganizationCategory | null;
  onSelect: (category: OrganizationCategory) => void;
}
