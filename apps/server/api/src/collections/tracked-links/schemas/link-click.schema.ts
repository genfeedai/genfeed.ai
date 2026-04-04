import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type LinkClickDocument = LinkClick & Document;

@Schema({ collection: 'link-clicks', timestamps: true })
export class LinkClick {
  @Prop({
    ref: 'TrackedLink',
    required: true,
    type: Types.ObjectId,
  })
  linkId!: Types.ObjectId;

  // When
  @Prop({ default: () => new Date(), required: true, type: Date })
  timestamp!: Date;

  // Who (anonymous)
  @Prop({ required: true, type: String })
  sessionId!: string;

  @Prop({ default: false, type: Boolean })
  isUnique!: boolean;

  // Context
  @Prop({ type: String })
  referrer?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: String })
  country?: string;

  @Prop({ type: String })
  device?: string;

  // Google Analytics
  @Prop({ type: String })
  gaClientId?: string;
}

export const LinkClickSchema = SchemaFactory.createForClass(LinkClick);
