import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document } from 'mongoose';

export type SkillReceiptDocument = SkillReceipt & Document;

@Schema({
  collection: 'skill-receipts',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class SkillReceipt {
  @Prop({
    index: true,
    required: true,
    type: String,
    unique: true,
  })
  receiptId!: string;

  @Prop({
    required: true,
    type: String,
  })
  email!: string;

  @Prop({
    enum: ['skill', 'bundle'],
    required: true,
    type: String,
  })
  productType!: string;

  @Prop({
    required: false,
    type: String,
  })
  skillSlug?: string;

  @Prop({
    required: true,
    type: String,
  })
  stripeSessionId!: string;

  @Prop({
    required: false,
    type: String,
  })
  stripePaymentIntentId?: string;

  @Prop({
    required: true,
    type: Number,
  })
  amountPaid!: number;

  @Prop({
    default: 'usd',
    type: String,
  })
  currency!: string;

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

  @Prop({
    default: 'pending',
    enum: ['pending', 'completed', 'refunded'],
    type: String,
  })
  status!: string;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;
}

export const SkillReceiptSchema = SchemaFactory.createForClass(SkillReceipt);
