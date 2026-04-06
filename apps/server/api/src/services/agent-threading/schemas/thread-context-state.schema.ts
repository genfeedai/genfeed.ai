import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ThreadContextStateDocument = ThreadContextState & Document;

@Schema({
  collection: 'thread-context-states',
  timestamps: true,
  versionKey: false,
})
export class ThreadContextState {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'AgentRoom', required: true, type: Types.ObjectId })
  thread!: Types.ObjectId;

  /** _id of the last AgentMessage folded into this compressed state */
  @Prop({ required: true, type: Types.ObjectId })
  lastIncorporatedMessageId!: Types.ObjectId;

  /** Total number of messages compressed into this state */
  @Prop({ default: 0, type: Number })
  messageCount!: number;

  /** Optimistic concurrency — reject stale writes */
  @Prop({ default: 0, type: Number })
  version!: number;

  /** Latest version of the content being iterated on */
  @Prop({ required: false, type: String })
  currentArtifact?: string;

  /** All user requirements accumulated across turns (bullet points) */
  @Prop({ required: false, type: String })
  accumulatedRequirements?: string;

  /** Important choices and feedback from the user */
  @Prop({ required: false, type: String })
  keyDecisions?: string;

  /** One-line summary per iteration round */
  @Prop({ required: false, type: String })
  iterationHistory?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ThreadContextStateSchema =
  SchemaFactory.createForClass(ThreadContextState);

ThreadContextStateSchema.index(
  { organization: 1, thread: 1 },
  { name: 'idx_thread_context_state_thread', unique: true },
);
