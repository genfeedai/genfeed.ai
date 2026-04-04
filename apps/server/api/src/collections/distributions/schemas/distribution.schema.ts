import {
  DistributionContentType,
  DistributionPlatform,
  PublishStatus,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type DistributionDocument = Distribution & Document;

@Schema({
  collection: 'distributions',
  timestamps: true,
  versionKey: false,
})
export class Distribution {
  _id!: string;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ ref: 'Brand', type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({
    enum: Object.values(DistributionPlatform),
    required: true,
    type: String,
  })
  platform!: DistributionPlatform;

  @Prop({
    enum: Object.values(DistributionContentType),
    required: true,
    type: String,
  })
  contentType!: DistributionContentType;

  @Prop({ type: String })
  text?: string;

  @Prop({ type: String })
  mediaUrl?: string;

  @Prop({ type: String })
  caption?: string;

  @Prop({ required: true, type: String })
  chatId!: string;

  @Prop({
    default: PublishStatus.SCHEDULED,
    enum: Object.values(PublishStatus),
    type: String,
  })
  status!: PublishStatus;

  @Prop({ type: Date })
  scheduledAt?: Date;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: String })
  telegramMessageId?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const DistributionSchema = SchemaFactory.createForClass(Distribution);
