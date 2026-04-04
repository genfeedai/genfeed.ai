import { FanvueScheduleStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type FanvueScheduleDocument = FanvueSchedule & Document;

@Schema({
  collection: 'fanvue-schedules',
  timestamps: true,
  versionKey: false,
})
export class FanvueSchedule {
  @Prop({ required: true, type: Date })
  scheduledAt!: Date;

  @Prop({
    default: FanvueScheduleStatus.PENDING,
    enum: Object.values(FanvueScheduleStatus),
    type: String,
  })
  status!: FanvueScheduleStatus;

  @Prop({ required: false, type: String })
  caption?: string;

  @Prop({ default: [], type: [String] })
  mediaUrls!: string[];

  @Prop({ required: false, type: Number })
  price?: number;

  @Prop({ required: false, type: String })
  errorMessage?: string;

  @Prop({
    ref: 'FanvueContent',
    required: false,
    type: Types.ObjectId,
  })
  content?: Types.ObjectId;

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

export const FanvueScheduleSchema =
  SchemaFactory.createForClass(FanvueSchedule);

FanvueScheduleSchema.index(
  { isDeleted: 1, organization: 1, status: 1 },
  { name: 'idx_org_status', partialFilterExpression: { isDeleted: false } },
);

FanvueScheduleSchema.index(
  { scheduledAt: 1, status: 1 },
  { partialFilterExpression: { status: 'pending' } },
);
