import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'assets',
  timestamps: true,
  versionKey: false,
})
export class Asset {
  _id!: string;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    refPath: 'parentModel',
    required: false,
    type: Types.ObjectId,
  })
  parent?: Types.ObjectId;

  @Prop({
    enum: Object.values(AssetParent),
    required: true,
    type: String,
  })
  parentModel!: AssetParent;

  @Prop({
    enum: Object.values(AssetCategory),
    required: true,
    type: String,
  })
  category!: AssetCategory;

  @Prop({
    required: false,
    type: String,
  })
  externalId?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export type AssetDocument = Asset & Document;

export const AssetSchema = SchemaFactory.createForClass(Asset);
