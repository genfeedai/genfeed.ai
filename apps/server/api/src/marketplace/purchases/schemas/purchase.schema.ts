import { PurchaseStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type PurchaseDocument = Purchase & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'purchases',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Purchase {
  _id!: Types.ObjectId;
  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  buyer!: Types.ObjectId;

  @Prop({
    ref: 'Seller',
    required: true,
    type: Types.ObjectId,
  })
  seller!: Types.ObjectId;

  @Prop({
    ref: 'Listing',
    required: true,
    type: Types.ObjectId,
  })
  listing!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  // Snapshot of listing at purchase time
  @Prop({
    required: true,
    type: Object,
  })
  listingSnapshot!: {
    title: string;
    type: string;
    version: string;
    price: number;
  };

  // Financial details
  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  subtotal!: number;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  discount!: number;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  total!: number;

  @Prop({
    default: 'usd',
    type: String,
  })
  currency!: string;

  // Commission (15% platform fee)
  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  platformFee!: number;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  sellerEarnings!: number;

  // Payment details (for Phase 3+)
  @Prop({
    required: false,
    type: String,
  })
  stripeSessionId?: string;

  @Prop({
    required: false,
    type: String,
  })
  stripePaymentIntentId?: string;

  @Prop({
    required: false,
    type: String,
  })
  paymentMethod?: string;

  // Status
  @Prop({
    default: PurchaseStatus.PENDING,
    enum: PurchaseStatus,
    type: String,
  })
  status!: string;

  @Prop({
    required: false,
    type: String,
  })
  failureReason?: string;

  // Download tracking
  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  downloadCount!: number;

  @Prop({
    required: false,
    type: Date,
  })
  lastDownloadedAt?: Date;

  // Review tracking
  @Prop({
    default: false,
    type: Boolean,
  })
  hasReviewed!: boolean;

  @Prop({
    required: false,
    type: Object,
  })
  review?: {
    rating: number;
    comment: string;
    createdAt: Date;
  };

  // Gift feature
  @Prop({
    default: false,
    type: Boolean,
  })
  isGift!: boolean;

  @Prop({
    ref: 'User',
    required: false,
    type: Types.ObjectId,
  })
  giftRecipient?: Types.ObjectId;

  @Prop({
    required: false,
    type: String,
  })
  giftMessage?: string;

  // Discount tracking
  @Prop({
    required: false,
    type: String,
  })
  discountCode?: string;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;
}

export const PurchaseSchema = SchemaFactory.createForClass(Purchase);
