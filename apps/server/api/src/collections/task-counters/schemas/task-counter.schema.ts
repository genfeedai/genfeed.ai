import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TaskCounterDocument = TaskCounter & Document;

@Schema({
  collection: 'task-counters',
  timestamps: true,
  versionKey: false,
})
export class TaskCounter {
  _id!: string;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
    unique: true,
  })
  organization!: Types.ObjectId;

  @Prop({ default: 0, required: true, type: Number })
  lastNumber!: number;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TaskCounterSchema = SchemaFactory.createForClass(TaskCounter);
