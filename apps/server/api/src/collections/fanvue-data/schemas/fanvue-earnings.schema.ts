import { FanvueEarningsType } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type FanvueEarningsDocument = FanvueEarnings & Document;

@Schema({
  collection: 'fanvue-earnings',
  timestamps: true,
  versionKey: false,
})
export class FanvueEarnings {
  @Prop({ required: true, type: Number })
  amount!: number;

  @Prop({ default: 'USD', type: String })
  currency!: string;

  @Prop({
    default: FanvueEarningsType.SUBSCRIPTION,
    enum: Object.values(FanvueEarningsType),
    type: String,
  })
  type!: FanvueEarningsType;

  @Prop({ required: false, type: String })
  externalTransactionId?: string;

  @Prop({ required: false, type: Date })
  earnedAt?: Date;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FanvueEarningsSchema =
  SchemaFactory.createForClass(FanvueEarnings);

FanvueEarningsSchema.index(
  { isDeleted: 1, organization: 1, type: 1 },
  { name: 'idx_org_type', partialFilterExpression: { isDeleted: false } },
);

FanvueEarningsSchema.index({ earnedAt: -1, organization: 1 });
