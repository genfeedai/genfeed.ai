import {
  ContentType,
  Platform,
  PostStatus,
  PublishStatus,
  SchedulingMethod,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ScheduleDocument = Schedule & Document;

@Schema({ collection: 'schedules', timestamps: true })
export class Schedule {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', type: Types.ObjectId })
  user?: Types.ObjectId;

  @Prop({ required: true, type: String })
  content!: string;

  @Prop({
    enum: Object.values(ContentType),
    required: true,
    type: String,
  })
  contentType!: ContentType;

  @Prop({
    enum: Object.values(Platform),
    required: true,
    type: String,
  })
  platform!: Platform;

  @Prop({ ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({ required: true, type: Date })
  scheduledAt!: Date;

  @Prop({
    default: PostStatus.PENDING,
    enum: [
      PostStatus.PENDING,
      PublishStatus.PUBLISHED,
      PublishStatus.FAILED,
      PublishStatus.CANCELLED,
    ],
    type: String,
  })
  status!:
    | PostStatus.PENDING
    | PublishStatus.PUBLISHED
    | PublishStatus.FAILED
    | PublishStatus.CANCELLED;

  @Prop({ enum: Object.values(SchedulingMethod), type: String })
  schedulingMethod?: SchedulingMethod;

  @Prop({ max: 100, min: 0, type: Number })
  expectedEngagement?: number; // AI prediction

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: Object })
  performance?: {
    actualEngagement?: number;
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);
