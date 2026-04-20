import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Document } from 'mongoose';

@Schema({ collection: 'desktop_messages', timestamps: false })
export class DesktopMessage {
  @Prop({ required: true })
  content!: string;

  @Prop({ required: true })
  createdAt!: string;

  @Prop({ required: false })
  draftId?: string;

  @Prop({ required: false })
  generatedContent?: string;

  @Prop({ required: false })
  id!: string;

  @Prop({ required: true })
  role!: string;

  @Prop({ index: true, required: true })
  threadId!: string;
}

export type DesktopMessageDocument = DesktopMessage & Document;
export const DesktopMessageSchema =
  SchemaFactory.createForClass(DesktopMessage);
DesktopMessageSchema.index({ id: 1 }, { unique: true });
DesktopMessageSchema.index({ threadId: 1, createdAt: 1 });
