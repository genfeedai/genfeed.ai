import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const CRON_JOB_TYPES = [
  'workflow_execution',
  'agent_strategy_execution',
  'newsletter_substack',
] as const;

export type CronJobType = (typeof CRON_JOB_TYPES)[number];

export const CRON_JOB_STATUSES = [
  'never',
  'running',
  'success',
  'failed',
] as const;

export type CronJobLastStatus = (typeof CRON_JOB_STATUSES)[number];

export type CronJobDocument = CronJob & Document;

@Schema({
  collection: 'cron-jobs',
  timestamps: true,
  versionKey: false,
})
export class CronJob {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ required: true, trim: true, type: String })
  name!: string;

  @Prop({ enum: CRON_JOB_TYPES, required: true, type: String })
  jobType!: CronJobType;

  @Prop({ default: true, type: Boolean })
  enabled!: boolean;

  @Prop({ required: true, type: String })
  schedule!: string;

  @Prop({ default: 'UTC', type: String })
  timezone!: string;

  @Prop({ default: {}, type: Object })
  payload!: Record<string, unknown>;

  @Prop({ required: false, type: Date })
  lastRunAt?: Date;

  @Prop({ default: 'never', enum: CRON_JOB_STATUSES, type: String })
  lastStatus!: CronJobLastStatus;

  @Prop({ required: false, type: Date })
  nextRunAt?: Date;

  @Prop({ default: 0, type: Number })
  consecutiveFailures!: number;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CronJobSchema = SchemaFactory.createForClass(CronJob);
