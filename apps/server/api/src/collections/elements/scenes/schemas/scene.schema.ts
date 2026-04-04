import { ModelCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ElementSceneDocument = ElementScene & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'elements-scenes',
  timestamps: true,
  versionKey: false,
})
export class ElementScene {
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

  @Prop({ default: false, type: Boolean })
  isFavorite!: boolean;
}

export const ElementSceneSchema = SchemaFactory.createForClass(ElementScene);

ElementSceneSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);
