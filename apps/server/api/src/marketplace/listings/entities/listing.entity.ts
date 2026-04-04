import { ListingStatus, ListingType } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class ListingEntity {
  seller!: Types.ObjectId;
  organization!: Types.ObjectId;
  type!: ListingType;
  title!: string;
  slug!: string;
  shortDescription!: string;
  description!: string;
  price?: number;
  currency?: string;
  tags?: string[];
  thumbnail?: string;
  previewImages?: string[];
  previewVideo?: string;
  previewData?: Record<string, unknown>;
  downloadData?: Record<string, unknown>;
  views?: number;
  downloads?: number;
  purchases?: number;
  rating?: number;
  reviewCount?: number;
  likeCount?: number;
  revenue?: number;
  version?: string;
  changelog?: string;
  status?: ListingStatus;
  rejectionReason?: string;
  publishedAt?: Date;
  canBeSoldSeparately?: boolean;
  isDeleted?: boolean;
  pricingTier?: string;
  isOfficial?: boolean;
  packageSource?: string;
  packageSlug?: string;
  installCount?: number;

  constructor(partial: Partial<ListingEntity>) {
    Object.assign(this, partial);
  }
}
