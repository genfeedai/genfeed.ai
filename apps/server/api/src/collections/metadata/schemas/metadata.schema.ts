import { isTrainingKey } from '@api/collections/models/utils/model-key.util';
import { generateLabel } from '@api/shared/utils/label/label.util';
import { MetadataExtension, MetadataStyle, ModelKey } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type MetadataDocument = Metadata & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'metadata',
  timestamps: true,
  versionKey: false,
})
export class Metadata {
  @Prop({ default: () => generateLabel(), type: String })
  label!: string;

  @Prop({ default: 'Default Description', type: String })
  description?: string;

  @Prop({
    ref: 'Prompt',
    type: Types.ObjectId,
  })
  prompt?: Types.ObjectId;

  @Prop({
    required: false,
    set: (v: unknown) => (v === '' || v === undefined ? null : v),
    type: String,
    validate: {
      message: 'Invalid model key',
      validator: (v: unknown) => {
        if (v == null || v === '') {
          return true;
        }
        return (
          Object.values(ModelKey).includes(v as ModelKey) || isTrainingKey(v)
        );
      },
    },
  })
  model?: string;

  @Prop({
    enum: [...Object.values(MetadataStyle), null, ''],
    required: false,
    set: (v: unknown) => (v === '' || v === undefined ? null : v),
    type: String,
  })
  style?: MetadataStyle | null;

  @Prop({
    enum: Object.values(MetadataExtension),
    required: true,
    set: (v: string) => v?.toLowerCase(),
    type: String,
  })
  extension!: MetadataExtension;

  @Prop({
    required: false,
    type: String,
  })
  assistant?: string;

  @Prop({ default: '', type: String })
  result?: string;

  @Prop({ required: false, type: String })
  error?: string;

  @Prop({
    index: true,
    required: false,
    set: (v: unknown) => (v === '' || v == null ? undefined : v),
    sparse: true,
    type: String,
  })
  externalId?: string;

  @Prop({
    index: true,
    required: false,
    set: (v: unknown) => (v === '' || v == null ? undefined : v),
    sparse: true,
    type: String,
  })
  externalProvider?: string;

  @Prop({ default: 0, type: Number })
  width?: number;

  @Prop({ default: 0, type: Number })
  height?: number;

  @Prop({ default: 0, type: Number })
  duration?: number;

  @Prop({ default: 0, type: Number })
  size?: number;

  @Prop({ default: false, type: Boolean })
  hasAudio?: boolean;

  @Prop({ required: false, type: Number })
  fps?: number;

  @Prop({ required: false, type: String })
  resolution?: string;

  @Prop({
    default: [],
    ref: 'Tag',
    type: [Types.ObjectId],
  })
  tags?: Types.ObjectId[];

  @Prop({ required: false, type: Number })
  seed?: number;

  // Template tracking fields
  @Prop({ required: false, type: String })
  promptTemplate?: string;

  @Prop({ required: false, type: Number })
  templateVersion?: number;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const MetadataSchema = SchemaFactory.createForClass(Metadata);
