import { ModelCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ElementBlacklistDocument = ElementBlacklist & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'elements-blacklists',
  timestamps: true,
  versionKey: false,
})
export class ElementBlacklist {
  _id!: string;

  @Prop({
    ref: 'Organization',
    required: false,
    type: Types.ObjectId,
  })
  organization?: Types.ObjectId;

  @Prop({
    enum: ModelCategory,
    required: false,
    type: String,
  })
  category!: ModelCategory;

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
    required: true,
    type: String,
    unique: true,
  })
  key!: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDefault!: boolean;
}

export const ElementBlacklistSchema =
  SchemaFactory.createForClass(ElementBlacklist);

ElementBlacklistSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);
