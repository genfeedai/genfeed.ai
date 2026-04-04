import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export const GOAL_STATUSES = ['active', 'completed', 'archived'] as const;
export const GOAL_LEVELS = ['company', 'team', 'individual'] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];
export type GoalLevel = (typeof GOAL_LEVELS)[number];
export type GoalDocument = Goal & Document;

@Schema({
  collection: 'goals',
  timestamps: true,
  versionKey: false,
})
export class Goal {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ required: true, trim: true, type: String })
  title!: string;

  @Prop({ required: false, type: String })
  description?: string;

  @Prop({
    default: 'active',
    enum: GOAL_STATUSES,
    type: String,
  })
  status!: GoalStatus;

  @Prop({
    default: 'company',
    enum: GOAL_LEVELS,
    type: String,
  })
  level!: GoalLevel;

  @Prop({ ref: 'Goal', required: false, type: Types.ObjectId })
  parentId?: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const GoalSchema = SchemaFactory.createForClass(Goal);
