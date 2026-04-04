import { ModelCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ElementMoodDocument = ElementMood & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'elements-moods',
  timestamps: true,
  versionKey: false,
})
export class ElementMood {
  _id!: string;

  @Prop({
    ref: 'User',
    required: false,
    type: Types.ObjectId,
  })
  user?: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: false,
    type: Types.ObjectId,
  })
  organization?: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    unique: true,
  })
  key!: string;

  @Prop({
    required: true,
    type: String,
  })
  label!: string;

  @Prop({
    required: false,
    type: String,
  })
  description?: string;

  @Prop({
    enum: Object.values(ModelCategory),
    required: false,
    type: String,
  })
  category?: ModelCategory;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ElementMoodSchema = SchemaFactory.createForClass(ElementMood);

ElementMoodSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);
