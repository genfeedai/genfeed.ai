import { TemplateDifficulty } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TemplateMetadataDocument = TemplateMetadata & Document;

/**
 * Template Metadata Schema
 * Stores template properties and aggregated usage statistics
 * One-to-one relationship with Template (merged from TemplateUsage)
 */
@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'template-metadata',
  timestamps: true,
  versionKey: false,
})
export class TemplateMetadata {
  @Prop({
    index: true,
    ref: 'Template',
    required: true,
    type: Types.ObjectId,
    unique: true,
  })
  template!: Types.ObjectId; // Reference to Template

  // Template properties
  @Prop({ default: null, type: Number })
  estimatedTime?: number; // Minutes to complete

  @Prop({
    enum: ['beginner', 'intermediate', 'advanced'],
    type: String,
  })
  difficulty?: TemplateDifficulty;

  @Prop({ default: [], type: [String] })
  goals?: string[]; // What this template helps achieve

  @Prop({ default: null, type: String })
  version?: string;

  @Prop({ default: null, type: String })
  author?: string;

  @Prop({ default: null, type: String })
  license?: string;

  @Prop({ default: [], type: [String] })
  requiredFeatures?: string[];

  @Prop({ default: [], type: [String] })
  compatiblePlatforms?: string[];

  // Aggregated usage statistics (derived from individual usage records)
  @Prop({ default: null, type: Number })
  successRate?: number; // % of successful generations

  @Prop({ default: null, type: Number })
  averageQuality?: number; // Average rating

  @Prop({ default: 0, type: Number })
  usageCount?: number; // Total number of times used

  @Prop({ default: null, type: Date })
  lastUsed?: Date; // Last usage timestamp

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TemplateMetadataSchema =
  SchemaFactory.createForClass(TemplateMetadata);
