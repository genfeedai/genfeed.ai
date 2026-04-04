import { PayoutStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type PayoutDocument = Payout & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'payouts',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Payout {
  @Prop({
    ref: 'Seller',
    required: true,
    type: Types.ObjectId,
  })
  seller!: Types.ObjectId;

  @Prop({
    min: 0,
    required: true,
    type: Number,
  })
  amount!: number;

  @Prop({
    default: 'usd',
    type: String,
  })
  currency!: string;

  @Prop({
    default: PayoutStatus.PENDING,
    enum: PayoutStatus,
    type: String,
  })
  status!: string;

  @Prop({
    required: false,
    type: String,
  })
  stripePayoutId?: string;

  @Prop({
    required: false,
    type: String,
  })
  failureReason?: string;

  @Prop({
    required: false,
    type: Date,
  })
  completedAt?: Date;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);
