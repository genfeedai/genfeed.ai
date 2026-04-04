import { SoundCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ElementSoundDocument = ElementSound & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'elements-sounds',
  timestamps: true,
  versionKey: false,
})
export class ElementSound {
  _id!: string;

  @Prop({
    ref: 'Organization',
    required: false,
    type: Types.ObjectId,
  })
  organization?: Types.ObjectId;

  @Prop({
    enum: [...Object.values(SoundCategory), null],
    required: false,
    type: String,
  })
  category?: SoundCategory;

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

export const ElementSoundSchema = SchemaFactory.createForClass(ElementSound);

ElementSoundSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);
