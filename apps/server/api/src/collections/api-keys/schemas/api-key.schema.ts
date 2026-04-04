import { ApiKeyCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

@Schema({ collection: 'api-keys', timestamps: true })
export class ApiKey {
  @Prop({
    index: true,
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ index: true, required: true, type: String, unique: true })
  key!: string;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({
    default: ApiKeyCategory.GENFEEDAI,
    enum: ApiKeyCategory,
    required: true,
    type: String,
  })
  category!: ApiKeyCategory;

  @Prop({ required: false, type: String })
  description?: string;

  @Prop({ default: [], type: [String] })
  scopes!: string[];

  @Prop({ type: Date })
  lastUsedAt?: Date;

  @Prop({ type: String })
  lastUsedIp?: string;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: false, type: Boolean })
  isRevoked!: boolean;

  @Prop({ type: Date })
  revokedAt?: Date;

  @Prop({ default: 0, type: Number })
  usageCount!: number;

  @Prop({ type: Number })
  rateLimit?: number; // requests per minute

  @Prop({ default: [], type: [String] })
  allowedIps?: string[];

  @Prop({ index: true, required: false, type: String })
  keyFingerprint?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
