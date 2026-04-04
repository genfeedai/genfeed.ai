import { ModelCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ElementLightingDocument = ElementLighting & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'elements-lightings',
  timestamps: true,
  versionKey: false,
})
export class ElementLighting {
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
    enum: [...Object.values(ModelCategory), null, ''],
    required: false,
    set: (v: unknown) => (v === '' || v === undefined ? null : v),
    type: String,
  })
  category?: ModelCategory | null;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDefault!: boolean;
}

export const ElementLightingSchema =
  SchemaFactory.createForClass(ElementLighting);

ElementLightingSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);
