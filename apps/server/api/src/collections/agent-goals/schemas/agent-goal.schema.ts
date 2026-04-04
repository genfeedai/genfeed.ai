import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AgentGoalDocument = AgentGoal & Document;

export const AGENT_GOAL_METRICS = [
  'engagement_rate',
  'posts',
  'views',
] as const;

export type AgentGoalMetric = (typeof AGENT_GOAL_METRICS)[number];

@Schema({
  collection: 'agent-goals',
  timestamps: true,
  versionKey: false,
})
export class AgentGoal {
  _id!: Types.ObjectId;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ ref: 'Brand', type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ required: true, trim: true, type: String })
  label!: string;

  @Prop({ trim: true, type: String })
  description?: string;

  @Prop({ enum: AGENT_GOAL_METRICS, required: true, type: String })
  metric!: AgentGoalMetric;

  @Prop({ min: 0, required: true, type: Number })
  targetValue!: number;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ default: 0, min: 0, type: Number })
  currentValue!: number;

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  progressPercent!: number;

  @Prop({ type: Date })
  lastEvaluatedAt?: Date;
}

export const AgentGoalSchema = SchemaFactory.createForClass(AgentGoal);
