import { ModelCategory, ModelKey } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ElementStyleDocument = ElementStyle & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'elements-styles',
  timestamps: true,
  versionKey: false,
})
export class ElementStyle {
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

  @Prop({
    default: [],
    enum: Object.values(ModelKey),
    required: false,
    type: [String],
  })
  models?: ModelKey[];

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ElementStyleSchema = SchemaFactory.createForClass(ElementStyle);

ElementStyleSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);
