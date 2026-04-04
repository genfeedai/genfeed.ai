import { SellerBadgeTier, SellerStatus } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class SellerEntity {
  user!: Types.ObjectId;
  organization!: Types.ObjectId;
  displayName!: string;
  slug!: string;
  bio?: string;
  avatar?: string;
  website?: string;
  social?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
    youtube?: string;
  };
  stripeAccountId?: string;
  stripeOnboardingComplete?: boolean;
  payoutEnabled?: boolean;
  totalEarnings?: number;
  totalSales?: number;
  rating?: number;
  reviewCount?: number;
  followerCount?: number;
  badgeTier?: SellerBadgeTier;
  status?: SellerStatus;
  isDeleted?: boolean;

  constructor(partial: Partial<SellerEntity>) {
    Object.assign(this, partial);
  }
}
