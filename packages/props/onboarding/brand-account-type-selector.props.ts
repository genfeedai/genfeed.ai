import type { OrganizationCategory } from '@genfeedai/contracts';

export interface BrandAccountTypeSelectorProps {
  disabled?: boolean;
  accountType: OrganizationCategory | null;
  onSelect: (category: OrganizationCategory) => void;
}
