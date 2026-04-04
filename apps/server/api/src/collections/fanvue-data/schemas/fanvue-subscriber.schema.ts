import { FanvueSubscriberStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type FanvueSubscriberDocument = FanvueSubscriber & Document;

@Schema({
  collection: 'fanvue-subscribers',
  timestamps: true,
  versionKey: false,
})
export class FanvueSubscriber {
  @Prop({ required: true, type: String })
  externalId!: string;

  @Prop({ required: false, type: String })
  username?: string;

  @Prop({ required: false, type: String })
  displayName?: string;

  @Prop({
    default: FanvueSubscriberStatus.ACTIVE,
    enum: Object.values(FanvueSubscriberStatus),
    type: String,
  })
  status!: FanvueSubscriberStatus;

  @Prop({ required: false, type: Date })
  subscribedAt?: Date;

  @Prop({ required: false, type: Date })
  expiresAt?: Date;

  @Prop({ required: false, type: Number })
  tier?: number;

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

export const FanvueSubscriberSchema =
  SchemaFactory.createForClass(FanvueSubscriber);

FanvueSubscriberSchema.index(
  { isDeleted: 1, organization: 1, status: 1 },
  { name: 'idx_org_status', partialFilterExpression: { isDeleted: false } },
);

FanvueSubscriberSchema.index(
  { externalId: 1, organization: 1 },
  { unique: true },
);
