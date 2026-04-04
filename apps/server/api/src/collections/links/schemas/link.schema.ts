import { LinkCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type LinkDocument = Link & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'links',
  timestamps: true,
  versionKey: false,
})
export class Link {
  _id!: string;

  @Prop({
    ref: 'Brand',
    required: true,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({
    enum: Object.values(LinkCategory),
    required: true,
    type: String,
  })
  category!: LinkCategory;

  @Prop({ required: true, type: String })
  url!: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const LinkSchema = SchemaFactory.createForClass(Link);
