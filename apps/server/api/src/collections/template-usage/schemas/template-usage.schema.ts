import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TemplateUsageDocument = TemplateUsage & Document;

@Schema({ collection: 'template-usages', timestamps: true })
export class TemplateUsage {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', type: Types.ObjectId })
  user?: Types.ObjectId;

  @Prop({
    ref: 'Template',
    required: true,
    type: Types.ObjectId,
  })
  template!: Types.ObjectId;

  @Prop({ required: true, type: String })
  generatedContent!: string;

  @Prop({ type: Object })
  variables?: Record<string, string>; // The values used

  @Prop({ max: 5, min: 1, type: Number })
  rating?: number;

  @Prop({ type: String })
  feedback?: string;

  @Prop({ default: false, type: Boolean })
  wasModified!: boolean; // Did user edit the generated content?
}

export const TemplateUsageSchema = SchemaFactory.createForClass(TemplateUsage);
