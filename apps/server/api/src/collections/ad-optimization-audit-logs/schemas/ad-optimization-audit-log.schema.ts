import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AdOptimizationAuditLogDocument = AdOptimizationAuditLog & Document;

export interface AuditLogError {
  message: string;
  timestamp: Date;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'ad-optimization-audit-logs',
  timestamps: true,
  versionKey: false,
})
export class AdOptimizationAuditLog {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ required: true, type: String })
  runId!: string;

  @Prop({ required: true, type: Date })
  runDate!: Date;

  @Prop({ default: 0, type: Number })
  adsAnalyzed!: number;

  @Prop({ default: 0, type: Number })
  recommendationsGenerated!: number;

  @Prop({ default: 0, type: Number })
  durationMs!: number;

  @Prop({ default: [], type: [Object] })
  auditErrors!: AuditLogError[];

  @Prop({ type: Object })
  configSnapshot?: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AdOptimizationAuditLogSchema = SchemaFactory.createForClass(
  AdOptimizationAuditLog,
);
