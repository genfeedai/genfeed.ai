import { AssetScope, TemplateCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TemplateDocument = Template & Document;

export interface ITemplateVariable {
  name: string; // e.g., "product_name", "cta"
  label: string; // e.g., "Product Name", "Call to Action"
  description: string;
  type: 'text' | 'number' | 'date' | 'select';
  required: boolean;
  defaultValue?: string;
  options?: string[]; // For select type
}

@Schema({ collection: 'templates', timestamps: true })
export class Template {
  @Prop({
    index: true,
    sparse: true,
    type: String,
    unique: true,
  })
  key?: string; // Optional unique key for prompt templates (e.g., "article.generate.default")

  @Prop({
    enum: ['content', 'prompt'],
    index: true,
    required: true,
    type: String,
  })
  purpose!: 'content' | 'prompt'; // Distinguishes template type

  @Prop({
    enum: TemplateCategory,
    index: true,
    type: String,
  })
  category?: TemplateCategory; // Unified category for both content and prompt templates

  @Prop({
    ref: 'Organization',
    type: Types.ObjectId,
  })
  organization?: Types.ObjectId; // Optional - null = global template

  @Prop({ ref: 'User', type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ required: true, type: String })
  content!: string; // Template with variables: "Hey {{customer_name}}, check out {{product_name}}!"

  @Prop({ default: [], type: Array })
  variables!: ITemplateVariable[];

  @Prop({ default: [], type: Array })
  categories!: string[]; // ['social-media', 'marketing', 'educational']

  @Prop({ default: [], type: Array })
  industries!: string[]; // ['technology', 'fitness', 'travel']

  @Prop({ default: [], type: Array })
  platforms!: string[]; // ['instagram', 'linkedin', 'youtube']

  @Prop({ default: [], type: Array })
  tags!: string[];

  @Prop({
    default: AssetScope.USER,
    enum: AssetScope,
    index: true,
    type: String,
  })
  scope!: AssetScope;

  @Prop({ default: false, type: Boolean })
  isFeatured!: boolean; // Featured template

  @Prop({ default: 0, type: Number })
  usageCount!: number; // How many times it's been used

  @Prop({ default: 0, max: 5, min: 0, type: Number })
  rating!: number;

  @Prop({ default: 0, type: Number })
  ratingCount!: number;

  @Prop({ default: 1, type: Number })
  version?: number; // Track template versions (for prompt templates)

  @Prop({ default: true, type: Boolean })
  isActive?: boolean; // Enable/disable templates (for prompt templates)

  @Prop({
    ref: 'TemplateMetadata',
    type: Types.ObjectId,
  })
  metadata?: Types.ObjectId; // Reference to TemplateMetadata

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
