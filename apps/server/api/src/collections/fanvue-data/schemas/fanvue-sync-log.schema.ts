import { FanvueSyncAction, FanvueSyncStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type FanvueSyncLogDocument = FanvueSyncLog & Document;

@Schema({
  collection: 'fanvue-sync-logs',
  timestamps: true,
  versionKey: false,
})
export class FanvueSyncLog {
  @Prop({
    enum: Object.values(FanvueSyncAction),
    required: true,
    type: String,
  })
  action!: FanvueSyncAction;

  @Prop({
    enum: Object.values(FanvueSyncStatus),
    required: true,
    type: String,
  })
  status!: FanvueSyncStatus;

  @Prop({ required: false, type: String })
  errorMessage?: string;

  @Prop({ required: false, type: Number })
  itemsProcessed?: number;

  @Prop({ required: false, type: Number })
  itemsFailed?: number;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

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

export const FanvueSyncLogSchema = SchemaFactory.createForClass(FanvueSyncLog);

FanvueSyncLogSchema.index(
  { action: 1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_action', partialFilterExpression: { isDeleted: false } },
);

FanvueSyncLogSchema.index({ createdAt: -1, organization: 1 });
