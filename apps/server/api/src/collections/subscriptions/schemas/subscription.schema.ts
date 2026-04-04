import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'subscriptions',
  timestamps: true,
  versionKey: false,
})
export class Subscription {
  _id!: string;

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

  @Prop({ ref: 'Customer', required: true, type: Types.ObjectId })
  customer!: Types.ObjectId;

  @Prop({ required: true, type: String })
  stripeCustomerId!: string;

  @Prop({ required: false, type: String })
  stripeSubscriptionId?: string;

  @Prop({ required: false, type: String })
  stripePriceId?: string;

  @Prop({ required: false, type: Date })
  currentPeriodEnd?: Date;

  @Prop({ default: false, type: Boolean })
  cancelAtPeriodEnd!: boolean;

  @Prop({
    default: SubscriptionPlan.MONTHLY,
    enum: Object.values(SubscriptionPlan),
    type: String,
  })
  type?: SubscriptionPlan;

  @Prop({
    enum: Object.values(SubscriptionStatus),
    required: true,
    type: String,
  })
  status!: SubscriptionStatus;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
