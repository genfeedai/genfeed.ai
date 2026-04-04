import { AgentThreadStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export {
  AgentMessageDoc as AgentMessage,
  type AgentMessageDocument,
  ToolCall,
  ToolCallSchema,
} from '@api/collections/agent-messages/schemas/agent-message.schema';

export type AgentRoomDocument = AgentRoom & Document;

@Schema({
  collection: 'agent-threads',
  timestamps: true,
  versionKey: false,
})
export class AgentRoom {
  _id!: string;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ required: false, type: String })
  title?: string;

  @Prop({ required: false, type: String })
  source?: string;

  @Prop({
    default: AgentThreadStatus.ACTIVE,
    enum: Object.values(AgentThreadStatus),
    type: String,
  })
  status!: AgentThreadStatus;

  @Prop({ default: false, type: Boolean })
  isPinned!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ required: false, type: String })
  systemPrompt?: string;

  @Prop({ default: false, type: Boolean })
  planModeEnabled!: boolean;

  @Prop({ required: false, type: String })
  parentThreadId?: string;

  @Prop({ default: [], type: [String] })
  memoryEntryIds?: string[];
}

export const AgentRoomSchema = SchemaFactory.createForClass(AgentRoom);
