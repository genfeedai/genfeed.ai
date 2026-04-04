import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type SubscriptionAttributionDocument = SubscriptionAttribution &
  Document;

@Schema({ collection: 'subscription-attributions', timestamps: true })
export class SubscriptionAttribution {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  // Stripe subscription info
  @Prop({ index: true, required: true, type: String, unique: true })
  stripeSubscriptionId!: string;

  @Prop({ required: true, type: String })
  stripeCustomerId!: string;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ required: true, type: String })
  email!: string;

  @Prop({ required: true, type: String })
  plan!: string;

  @Prop({ required: true, type: Number })
  amount!: number;

  @Prop({ default: 'USD', type: String })
  currency!: string;

  // Attribution (what content led to this?)
  @Prop({
    type: {
      content: { ref: 'Ingredient', type: Types.ObjectId },
      contentType: String,
      link: { ref: 'TrackedLink', type: Types.ObjectId },
      platform: String,
      sessionId: String,
    },
  })
  source?: {
    content: Types.ObjectId;
    contentType: string;
    platform: string;
    link?: Types.ObjectId;
    sessionId?: string;
  };

  // UTM parameters
  @Prop({
    type: {
      campaign: String,
      content: String,
      medium: String,
      source: String,
    },
  })
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
  };

  // Timeline
  @Prop({ default: () => new Date(), index: true, required: true, type: Date })
  subscribedAt!: Date;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: 'active', type: String })
  status!: string;
}

export const SubscriptionAttributionSchema = SchemaFactory.createForClass(
  SubscriptionAttribution,
);
