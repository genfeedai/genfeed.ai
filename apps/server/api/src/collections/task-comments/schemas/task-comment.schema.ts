import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TaskCommentDocument = TaskComment & Document;

@Schema({
  collection: 'task-comments',
  timestamps: true,
  versionKey: false,
})
export class TaskComment {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Task', required: true, type: Types.ObjectId })
  task!: Types.ObjectId;

  @Prop({ required: false, type: String })
  authorUserId?: string;

  @Prop({ required: false, type: String })
  authorAgentId?: string;

  @Prop({ required: true, type: String })
  body!: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TaskCommentSchema = SchemaFactory.createForClass(TaskComment);
