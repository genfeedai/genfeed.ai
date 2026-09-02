import type { SellerBadgeTier } from '../..';

/** Public seller preview nested on marketplace listing cards. */
export interface ISellerPreview {
  id: string;
  displayName: string;
  slug: string;
  avatar?: string;
  badgeTier: SellerBadgeTier;
  rating: number;
  totalSales: number;
}
