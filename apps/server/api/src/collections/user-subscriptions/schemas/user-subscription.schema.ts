import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type UserSubscriptionDocument = UserSubscription & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'user-subscriptions',
  timestamps: true,
  versionKey: false,
})
export class UserSubscription {
  _id!: string;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
    unique: true,
  })
  user!: Types.ObjectId;

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
    default: SubscriptionPlan.PAYG,
    enum: Object.values(SubscriptionPlan),
    type: String,
  })
  type?: SubscriptionPlan;

  @Prop({
    default: SubscriptionStatus.ACTIVE,
    enum: Object.values(SubscriptionStatus),
    required: true,
    type: String,
  })
  status!: SubscriptionStatus;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const UserSubscriptionSchema =
  SchemaFactory.createForClass(UserSubscription);
