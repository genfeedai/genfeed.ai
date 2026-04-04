import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CaptionDocument = Caption & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'captions',
  timestamps: true,
  versionKey: false,
})
export class Caption {
  _id!: string;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Ingredient',
    required: true,
    type: Types.ObjectId,
  })
  ingredient!: Types.ObjectId;

  @Prop({ required: true, type: String })
  content!: string;

  @Prop({ default: 'srt', type: String })
  format!: string;

  @Prop({ default: 'en', type: String })
  language!: string;

  // Agent attribution — set when created by a proactive agent run
  @Prop({ index: true, ref: 'AgentRun', required: false, type: Types.ObjectId })
  agentRunId?: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CaptionSchema = SchemaFactory.createForClass(Caption);
