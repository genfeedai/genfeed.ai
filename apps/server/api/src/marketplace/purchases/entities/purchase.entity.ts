import { PurchaseStatus } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class PurchaseEntity {
  buyer!: Types.ObjectId;
  seller!: Types.ObjectId;
  listing!: Types.ObjectId;
  organization!: Types.ObjectId;
  listingSnapshot!: {
    title: string;
    type: string;
    version: string;
    price: number;
  };
  subtotal?: number;
  discount?: number;
  total?: number;
  currency?: string;
  platformFee?: number;
  sellerEarnings?: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  paymentMethod?: string;
  status?: PurchaseStatus;
  failureReason?: string;
  downloadCount?: number;
  lastDownloadedAt?: Date;
  hasReviewed?: boolean;
  review?: {
    rating: number;
    comment: string;
    createdAt: Date;
  };
  isGift?: boolean;
  giftRecipient?: Types.ObjectId;
  giftMessage?: string;
  discountCode?: string;
  isDeleted?: boolean;

  constructor(partial: Partial<PurchaseEntity>) {
    Object.assign(this, partial);
  }
}
