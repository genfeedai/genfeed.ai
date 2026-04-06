import { AssetScope, PromptCategory, PromptStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type PromptDocument = Prompt & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'prompts',
  timestamps: true,
  versionKey: false,
})
export class Prompt {
  _id!: string;

  @Prop({
    ref: 'Organization',
    type: Types.ObjectId,
  })
  organization?: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    type: Types.ObjectId,
  })
  brand?: Types.ObjectId;

  @Prop({
    ref: 'User',
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Ingredient',
    required: false,
    type: Types.ObjectId,
  })
  ingredient?: Types.ObjectId;

  @Prop({
    ref: 'Article',
    required: false,
    type: Types.ObjectId,
  })
  article?: Types.ObjectId;

  @Prop({
    enum: [...Object.values(PromptCategory), null, ''],
    required: false,
    set: (v: unknown) => (v === '' || v === undefined ? null : v),
    type: String,
  })
  category?: PromptCategory | null;

  @Prop({
    required: true,
    type: String,
  })
  original!: string;

  @Prop({
    required: false,
    type: String,
  })
  enhanced!: string;

  @Prop({
    default: PromptStatus.DRAFT,
    enum: Object.values(PromptStatus),
    required: true,
    type: String,
  })
  status!: PromptStatus;

  // Style elements - stored as key strings
  @Prop({
    required: false,
    type: String,
  })
  style?: string;

  @Prop({
    required: false,
    type: String,
  })
  mood?: string;

  @Prop({
    required: false,
    type: String,
  })
  camera?: string;

  @Prop({
    required: false,
    type: String,
  })
  scene?: string;

  @Prop({
    required: false,
    type: String,
  })
  fontFamily?: string;

  @Prop({
    default: [],
    required: false,
    type: [String],
  })
  blacklists?: string[];

  @Prop({
    default: [],
    required: false,
    type: [String],
  })
  sounds?: string[];

  @Prop({
    default: [],
    ref: 'Tag',
    required: false,
    type: [Types.ObjectId],
  })
  tags?: Types.ObjectId[];

  // Model-specific fields
  @Prop({
    required: false,
    set: (v: unknown) => (v === '' || v === undefined ? null : v),
    type: String,
    validate: {
      message: 'Invalid model key',
      validator: (v: unknown) => {
        if (v == null || v === '') return true;
        return typeof v === 'string';
      },
    },
  })
  model?: string;

  // Additional metadata
  @Prop({
    required: false,
    type: Number,
  })
  duration?: number;

  @Prop({
    required: false,
    type: String,
  })
  ratio?: string;

  @Prop({
    required: false,
    type: String,
  })
  resolution?: string;

  @Prop({
    required: false,
    type: Number,
  })
  seed?: number;

  @Prop({
    required: false,
    type: String,
  })
  reference?: string;

  @Prop({
    default: false,
    required: false,
    type: Boolean,
  })
  isSkipEnhancement!: boolean;

  @Prop({
    default: AssetScope.USER,
    enum: Object.values(AssetScope),
    type: String,
  })
  scope!: AssetScope;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ default: false, type: Boolean })
  isFavorite!: boolean;

  @Prop({
    required: false,
    type: String,
  })
  speech?: string;
}

export const PromptSchema = SchemaFactory.createForClass(Prompt);
