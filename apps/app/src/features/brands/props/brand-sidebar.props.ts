import type { IBrand } from '@genfeedai/contracts/interfaces';
import type { Brand } from '@genfeedai/models/organization/brand.model';

export interface BrandSidebarPanelProps {
  /** The brand as the list row knows it; the panel loads the full record. */
  brand: IBrand | Brand;
  /** Called after the panel changed the brand, so the list can refresh. */
  onChange?: () => void;
}
