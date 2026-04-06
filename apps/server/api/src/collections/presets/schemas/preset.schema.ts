import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelCategory, ModelProvider, Platform } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type PresetDocument = Preset & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'presets',
  timestamps: true,
  versionKey: false,
})
export class Preset {
  _id!: string;

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
    ref: 'Ingredient',
    required: false,
    type: Types.ObjectId,
  })
  ingredient?: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ required: false, type: String })
  prompt?: string;

  @Prop({ required: true, type: String, unique: true })
  key!: string;

  @Prop({
    enum: Object.values(ModelCategory),
    required: true,
    type: String,
  })
  category!: ModelCategory;

  @Prop({
    enum: Object.values(MODEL_KEYS),
    required: false,
    type: String,
  })
  model?: string;

  @Prop({
    enum: Object.values(ModelProvider),
    required: false,
    type: String,
  })
  provider?: ModelProvider;

  @Prop({
    enum: Object.values(Platform),
    required: false,
    type: String,
  })
  platform?: Platform;

  @Prop({
    required: false,
    type: String,
  })
  camera?: string;

  @Prop({
    required: false,
    type: String,
  })
  mood?: string;

  @Prop({
    required: false,
    type: String,
  })
  scene?: string;

  @Prop({
    required: false,
    type: String,
  })
  style?: string;

  @Prop({
    default: [],
    type: [String],
  })
  blacklists?: string[];

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ default: false, type: Boolean })
  isFavorite!: boolean;
}

export const PresetSchema = SchemaFactory.createForClass(Preset);

PresetSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);

PresetSchema.index(
  { brand: 1, createdAt: -1, isDeleted: 1 },
  { name: 'idx_brand_created_at' },
);
