import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const CRON_RUN_STATUSES = [
  'queued',
  'running',
  'success',
  'failed',
] as const;

export type CronRunStatus = (typeof CRON_RUN_STATUSES)[number];

export const CRON_RUN_TRIGGERS = ['scheduled', 'manual'] as const;

export type CronRunTrigger = (typeof CRON_RUN_TRIGGERS)[number];

export type CronRunDocument = CronRun & Document;

@Schema({
  collection: 'cron-runs',
  timestamps: true,
  versionKey: false,
})
export class CronRun {
  _id!: string;

  @Prop({ ref: 'CronJob', required: true, type: Types.ObjectId })
  cronJob!: Types.ObjectId;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ enum: CRON_RUN_TRIGGERS, required: true, type: String })
  trigger!: CronRunTrigger;

  @Prop({ enum: CRON_RUN_STATUSES, required: true, type: String })
  status!: CronRunStatus;

  @Prop({ required: false, type: Date })
  startedAt?: Date;

  @Prop({ required: false, type: Date })
  endedAt?: Date;

  @Prop({ required: false, type: String })
  error?: string;

  @Prop({ default: {}, type: Object })
  artifacts!: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CronRunSchema = SchemaFactory.createForClass(CronRun);
