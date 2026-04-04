import { FanvueContentStatus, FanvueContentType } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type FanvueContentDocument = FanvueContent & Document;

@Schema({
  collection: 'fanvue-content',
  timestamps: true,
  versionKey: false,
})
export class FanvueContent {
  @Prop({ required: false, type: String })
  externalId?: string;

  @Prop({ required: false, type: String })
  title?: string;

  @Prop({ required: false, type: String })
  caption?: string;

  @Prop({
    default: FanvueContentType.IMAGE,
    enum: Object.values(FanvueContentType),
    type: String,
  })
  type!: FanvueContentType;

  @Prop({
    default: FanvueContentStatus.DRAFT,
    enum: Object.values(FanvueContentStatus),
    type: String,
  })
  status!: FanvueContentStatus;

  @Prop({ default: [], type: [String] })
  mediaUrls!: string[];

  @Prop({ required: false, type: Number })
  price?: number;

  @Prop({ required: false, type: Boolean })
  isPinned?: boolean;

  @Prop({ required: false, type: Date })
  publishedAt?: Date;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FanvueContentSchema = SchemaFactory.createForClass(FanvueContent);

FanvueContentSchema.index(
  { isDeleted: 1, organization: 1, status: 1 },
  { name: 'idx_org_status', partialFilterExpression: { isDeleted: false } },
);

FanvueContentSchema.index(
  { organization: 1, publishedAt: -1 },
  { partialFilterExpression: { isDeleted: false } },
);
