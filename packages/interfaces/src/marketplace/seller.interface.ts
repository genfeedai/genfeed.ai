import type { SellerBadgeTier, SellerStatus } from '@genfeedai/enums';
import type { IIdentifiable } from '../index';

export interface ISellerPreview {
  id: string;
  displayName: string;
  slug: string;
  avatar?: string;
  badgeTier: SellerBadgeTier;
  rating: number;
  totalSales: number;
}

export interface ISellerSocial {
  twitter?: string;
  github?: string;
  linkedin?: string;
  youtube?: string;
}

export interface ISeller extends IIdentifiable {
  user: string;
  organization: string;

  displayName: string;
  slug: string;
  bio?: string;
  avatar?: string;
  website?: string;

  social: ISellerSocial;

  stripeOnboardingComplete: boolean;
  payoutEnabled: boolean;

  totalEarnings: number;
  totalSales: number;
  rating: number;
  reviewCount: number;
  followerCount: number;

  badgeTier: SellerBadgeTier;
  status: SellerStatus;
}

export interface ISellerProfile extends ISeller {
  listingCount: number;
}
