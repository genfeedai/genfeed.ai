import { ListingStatus, ListingType } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ListingDocument = Listing & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'listings',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Listing {
  _id!: Types.ObjectId;
  @Prop({
    ref: 'Seller',
    required: true,
    type: Types.ObjectId,
  })
  seller!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  // Type and identifiers
  @Prop({
    enum: ListingType,
    required: true,
    type: String,
  })
  type!: string;

  @Prop({
    maxlength: 200,
    required: true,
    type: String,
  })
  title!: string;

  @Prop({
    lowercase: true,
    maxlength: 300,
    required: true,
    trim: true,
    type: String,
    unique: true,
  })
  slug!: string;

  @Prop({
    maxlength: 300,
    required: true,
    type: String,
  })
  shortDescription!: string;

  @Prop({
    maxlength: 10000,
    required: true,
    type: String,
  })
  description!: string;

  // Pricing
  @Prop({
    default: 0,
    max: 50000, // $500 max in cents
    min: 0,
    type: Number,
  })
  price!: number;

  @Prop({
    default: 'usd',
    type: String,
  })
  currency!: string;

  // Tags and discovery
  @Prop({
    default: [],
    type: [String],
  })
  tags!: string[];

  // Media
  @Prop({
    required: false,
    type: String,
  })
  thumbnail?: string;

  @Prop({
    default: [],
    type: [String],
  })
  previewImages!: string[];

  @Prop({
    required: false,
    type: String,
  })
  previewVideo?: string;

  // Content data
  @Prop({
    default: {},
    type: Object,
  })
  previewData!: Record<string, unknown>;

  @Prop({
    default: {},
    type: Object,
  })
  downloadData!: Record<string, unknown>;

  // Statistics
  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  views!: number;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  downloads!: number;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  purchases!: number;

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
  likeCount!: number;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  revenue!: number;

  // Versioning
  @Prop({
    default: '1.0.0',
    type: String,
  })
  version!: string;

  @Prop({
    required: false,
    type: String,
  })
  changelog?: string;

  // Status
  @Prop({
    default: ListingStatus.DRAFT,
    enum: ListingStatus,
    type: String,
  })
  status!: string;

  @Prop({
    required: false,
    type: String,
  })
  rejectionReason?: string;

  @Prop({
    required: false,
    type: Date,
  })
  publishedAt?: Date;

  // Package source tracking
  @Prop({
    required: false,
    type: String,
  })
  packageSource?: string;

  @Prop({
    required: false,
    type: String,
  })
  packageSlug?: string;

  // Pricing tier and official flag
  @Prop({
    default: 'free',
    enum: ['free', 'paid', 'premium'],
    type: String,
  })
  pricingTier!: string;

  @Prop({
    default: false,
    type: Boolean,
  })
  isOfficial!: boolean;

  @Prop({
    default: 0,
    min: 0,
    type: Number,
  })
  installCount!: number;

  // Flags
  @Prop({
    default: true,
    type: Boolean,
  })
  canBeSoldSeparately!: boolean;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;

  // Optional ComfyUI template for workflows that support "run on your own ComfyUI" export
  @Prop({ required: false, type: Object })
  comfyuiTemplate?: Record<string, unknown>;
}

export const ListingSchema = SchemaFactory.createForClass(Listing);
