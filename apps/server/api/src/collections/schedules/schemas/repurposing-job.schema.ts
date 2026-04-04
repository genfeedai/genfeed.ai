import { WorkflowStepStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type RepurposingJobDocument = RepurposingJob & Document;

export interface IRepurposingResult {
  format: string;
  url?: string;
  status: WorkflowStepStatus;
  error?: string;
}

@Schema({ collection: 'repurposing-jobs', timestamps: true })
export class RepurposingJob {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', type: Types.ObjectId })
  user?: Types.ObjectId;

  @Prop({ required: true, type: String })
  sourceContent!: string;

  @Prop({ required: true, type: String })
  sourceContentType!: string;

  @Prop({ default: [], type: Array })
  targetFormats!: string[]; // ['short-video', 'story', 'carousel', 'gif']

  @Prop({
    default: WorkflowStepStatus.PENDING,
    enum: Object.values(WorkflowStepStatus),
    type: String,
  })
  status!: WorkflowStepStatus;

  @Prop({ default: [], type: Array })
  results!: IRepurposingResult[];

  @Prop({ type: Object })
  settings?: {
    preserveBranding?: boolean;
    qualityLevel?: 'low' | 'medium' | 'high';
    targetDuration?: number;
  };

  @Prop({ max: 100, min: 0, type: Number })
  progress?: number;

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const RepurposingJobSchema =
  SchemaFactory.createForClass(RepurposingJob);
