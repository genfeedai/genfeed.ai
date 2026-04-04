import {
  AGENT_WORKFLOW_PHASES,
  type AgentWorkflowActor,
  type AgentWorkflowPhase,
  type AgentWorkflowTrigger,
} from '@api/workflows/agent-workflows.types';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentWorkflowDocument = AgentWorkflow & Document;

@Schema({ _id: false, versionKey: false })
export class AgentWorkflowTradeoffs {
  @Prop({ default: [], type: [String] })
  pros!: string[];

  @Prop({ default: [], type: [String] })
  cons!: string[];
}

@Schema({ _id: false, versionKey: false })
export class AgentWorkflowQuestionDoc {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String })
  text!: string;

  @Prop({
    enum: ['multiple_choice', 'free_text'],
    required: true,
    type: String,
  })
  type!: 'multiple_choice' | 'free_text';

  @Prop({ default: [], type: [String] })
  options!: string[];

  @Prop({ required: false, type: String })
  answer?: string;
}

@Schema({ _id: false, versionKey: false })
export class AgentWorkflowApproachDoc {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String })
  title!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ default: false, type: Boolean })
  recommended!: boolean;

  @Prop({ required: true, type: AgentWorkflowTradeoffs })
  tradeoffs!: AgentWorkflowTradeoffs;
}

@Schema({ _id: false, versionKey: false })
export class AgentWorkflowEvidenceDoc {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({
    enum: ['test_result', 'screenshot', 'log', 'diff'],
    required: true,
    type: String,
  })
  type!: 'test_result' | 'screenshot' | 'log' | 'diff';

  @Prop({ required: true, type: String })
  title!: string;

  @Prop({ required: true, type: String })
  content!: string;

  @Prop({ default: false, type: Boolean })
  passed!: boolean;
}

@Schema({ _id: false, versionKey: false })
export class AgentWorkflowMessageDoc {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({
    enum: AGENT_WORKFLOW_PHASES,
    required: true,
    type: String,
  })
  phase!: AgentWorkflowPhase;

  @Prop({
    enum: ['user', 'agent'],
    required: true,
    type: String,
  })
  role!: AgentWorkflowActor;

  @Prop({ required: true, type: String })
  content!: string;

  @Prop({ required: true, type: Number })
  timestamp!: number;
}

@Schema({ _id: false, versionKey: false })
export class AgentWorkflowPhaseHistoryEntryDoc {
  @Prop({
    enum: AGENT_WORKFLOW_PHASES,
    required: true,
    type: String,
  })
  from!: AgentWorkflowPhase;

  @Prop({
    enum: AGENT_WORKFLOW_PHASES,
    required: true,
    type: String,
  })
  to!: AgentWorkflowPhase;

  @Prop({
    enum: ['gate_met', 'force_advance', 'rollback'],
    required: true,
    type: String,
  })
  trigger!: AgentWorkflowTrigger;

  @Prop({
    enum: ['user', 'agent'],
    required: true,
    type: String,
  })
  actor!: AgentWorkflowActor;

  @Prop({ required: true, type: Date })
  timestamp!: Date;
}

@Schema({
  collection: 'agent-workflows',
  timestamps: true,
  versionKey: false,
})
export class AgentWorkflow {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ required: true, type: String })
  agentId!: string;

  @Prop({
    default: 'exploring',
    enum: AGENT_WORKFLOW_PHASES,
    type: String,
  })
  currentPhase!: AgentWorkflowPhase;

  @Prop({ default: {}, type: Object })
  gateStatus!: Record<AgentWorkflowPhase, boolean>;

  @Prop({ default: [], type: [AgentWorkflowPhaseHistoryEntryDoc] })
  phaseHistory!: AgentWorkflowPhaseHistoryEntryDoc[];

  @Prop({ required: false, type: String })
  linkedConversationId?: string | null;

  @Prop({ default: [], type: [AgentWorkflowQuestionDoc] })
  questions!: AgentWorkflowQuestionDoc[];

  @Prop({ default: [], type: [AgentWorkflowApproachDoc] })
  approaches!: AgentWorkflowApproachDoc[];

  @Prop({ default: null, type: String })
  selectedApproachId!: string | null;

  @Prop({ default: [], type: [AgentWorkflowEvidenceDoc] })
  verificationEvidence!: AgentWorkflowEvidenceDoc[];

  @Prop({ default: [], type: [AgentWorkflowMessageDoc] })
  messages!: AgentWorkflowMessageDoc[];

  @Prop({ default: false, type: Boolean })
  isLocked!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentWorkflowSchema = SchemaFactory.createForClass(AgentWorkflow);
