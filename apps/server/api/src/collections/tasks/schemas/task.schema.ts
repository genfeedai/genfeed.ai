import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'cancelled',
] as const;

export const TASK_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

export const TASK_LINKED_ENTITY_MODELS = [
  'Ingredient',
  'Post',
  'Article',
  'Evaluation',
] as const;

export type TaskLinkedEntityModel = (typeof TASK_LINKED_ENTITY_MODELS)[number];

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskDocument = Task & Document;

@Schema({
  collection: 'tasks',
  timestamps: true,
  versionKey: false,
})
export class Task {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ required: true, type: Number })
  taskNumber!: number;

  @Prop({ required: true, type: String, unique: true })
  identifier!: string;

  @Prop({ required: true, trim: true, type: String })
  title!: string;

  @Prop({ required: false, type: String })
  description?: string;

  @Prop({
    default: 'backlog',
    enum: TASK_STATUSES,
    type: String,
  })
  status!: TaskStatus;

  @Prop({
    default: 'medium',
    enum: TASK_PRIORITIES,
    type: String,
  })
  priority!: TaskPriority;

  @Prop({ ref: 'Task', required: false, type: Types.ObjectId })
  parentId?: Types.ObjectId;

  @Prop({ required: false, type: String })
  projectId?: string;

  @Prop({ required: false, type: String })
  goalId?: string;

  @Prop({ required: false, type: String })
  assigneeUserId?: string;

  @Prop({ required: false, type: String })
  assigneeAgentId?: string;

  @Prop({ required: false, type: String })
  checkoutRunId?: string;

  @Prop({ required: false, type: String })
  checkoutAgentId?: string;

  @Prop({ required: false, type: Date })
  checkedOutAt?: Date;

  @Prop({
    default: [],
    type: [
      {
        entityId: { required: true, type: Types.ObjectId },
        entityModel: {
          enum: TASK_LINKED_ENTITY_MODELS,
          required: true,
          type: String,
        },
      },
    ],
  })
  linkedEntities!: Array<{
    entityId: Types.ObjectId;
    entityModel: TaskLinkedEntityModel;
  }>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
