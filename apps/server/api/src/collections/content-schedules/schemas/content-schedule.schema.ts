import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ContentScheduleDocument = ContentSchedule & Document;

@Schema({ collection: 'content-schedules', timestamps: true })
export class ContentSchedule {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  cronExpression!: string;

  @Prop({ default: 'UTC', type: String })
  timezone!: string;

  @Prop({ default: [], required: true, type: [String] })
  skillSlugs!: string[];

  @Prop({ required: false, type: Object })
  skillParams?: Record<string, unknown>;

  @Prop({ default: true, type: Boolean })
  isEnabled!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ type: Date })
  lastRunAt?: Date;

  @Prop({ type: Date })
  nextRunAt?: Date;
}

export const ContentScheduleSchema =
  SchemaFactory.createForClass(ContentSchedule);
