import { TagCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TagDocument = Tag & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'tags',
  timestamps: true,
  versionKey: false,
})
export class Tag {
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
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  brand?: Types.ObjectId;

  @Prop({
    enum: Object.values(TagCategory),
    required: false,
    type: String,
  })
  category!: TagCategory;

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
    required: false,
    type: String,
  })
  key?: string;

  @Prop({
    default: '#000000',
    required: false,
    type: String,
  })
  backgroundColor?: string;

  @Prop({
    default: '#FFFFFF',
    required: false,
    type: String,
  })
  textColor?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;
}

export const TagSchema = SchemaFactory.createForClass(Tag);

TagSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);

TagSchema.index(
  { brand: 1, createdAt: -1, isDeleted: 1 },
  { name: 'idx_brand_created_at' },
);
