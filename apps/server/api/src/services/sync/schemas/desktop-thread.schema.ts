import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Document } from 'mongoose';

@Schema({ collection: 'desktop_threads', timestamps: false })
export class DesktopThread {
  @Prop({ index: true, required: true })
  clerkUserId!: string;

  @Prop({ required: true })
  createdAt!: string;

  @Prop({ required: false })
  id!: string;

  @Prop({ default: 'idle' })
  status!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  updatedAt!: string;

  @Prop({ required: false })
  workspaceId?: string;
}

export type DesktopThreadDocument = DesktopThread & Document;
export const DesktopThreadSchema = SchemaFactory.createForClass(DesktopThread);
DesktopThreadSchema.index({ id: 1 }, { unique: true });
DesktopThreadSchema.index({ clerkUserId: 1, updatedAt: -1 });
