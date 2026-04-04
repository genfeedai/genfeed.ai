import { SellerBadgeTier, SellerStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type SellerDocument = Seller & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'sellers',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Seller {
  _id!: Types.ObjectId;
  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
    unique: true,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    maxlength: 100,
    required: true,
    type: String,
  })
  displayName!: string;

  @Prop({
    lowercase: true,
    maxlength: 100,
    required: true,
    trim: true,
    type: String,
    unique: true,
  })
  slug!: string;

  @Prop({
    maxlength: 500,
    required: false,
    type: String,
  })
  bio?: string;

  @Prop({
    required: false,
    type: String,
  })
  avatar?: string;

  @Prop({
    required: false,
    type: String,
  })
  website?: string;

  @Prop({
    default: {},
    type: Object,
  })
  social!: {
    twitter?: string;
    github?: string;
    linkedin?: string;
    youtube?: string;
  };

  // Stripe Connect fields (for Phase 3)
  @Prop({
    required: false,
    type: String,
  })
  stripeAccountId?: string;

  @Prop({
    default: false,
    type: Boolean,
  })
  stripeOnboardingComplete!: boolean;

  @Prop({
    default: false,
    type: Boolean,
  })
  payoutEnabled!: boolean;

  // Statistics
  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  totalEarnings!: number;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  totalSales!: number;

  @Prop({
    default: 0,
    max: 5,
    min: 0,
    type: Number,
  })
  rating!: number;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  reviewCount!: number;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  followerCount!: number;

  // Status
  @Prop({
    default: SellerBadgeTier.NEW,
    enum: SellerBadgeTier,
    type: String,
  })
  badgeTier!: string;

  @Prop({
    default: SellerStatus.APPROVED,
    enum: SellerStatus,
    type: String,
  })
  status!: string;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;
}

export const SellerSchema = SchemaFactory.createForClass(Seller);
