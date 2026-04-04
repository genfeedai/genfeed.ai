import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type FolderDocument = Folder & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'folders',
  timestamps: true,
  versionKey: false,
})
export class Folder {
  _id!: string;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  brand?: Types.ObjectId;

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
    default: [],
    ref: 'Tag',
    type: [Types.ObjectId],
  })
  tags!: Types.ObjectId[];

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const FolderSchema = SchemaFactory.createForClass(Folder);

FolderSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);

FolderSchema.index(
  { brand: 1, createdAt: -1, isDeleted: 1 },
  { name: 'idx_brand_created_at' },
);
