import type { IPublicBrandReach } from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';

export interface BrandProfileStatsProps {
  /** Connected accounts, shown as avatars; an account that dropped off is left out. */
  accounts: readonly BrandDetailSocialConnection[];
  /** Lifetime totals; `null` while they load or when the read failed. */
  reach: IPublicBrandReach | null;
}
