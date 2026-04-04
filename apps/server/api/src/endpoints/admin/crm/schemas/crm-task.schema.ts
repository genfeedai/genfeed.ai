import { CrmTaskPriority, CrmTaskStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CrmTaskDocument = CrmTask & Document;

@Schema({
  collection: 'crm-tasks',
  timestamps: true,
  versionKey: false,
})
export class CrmTask {
  @Prop({ required: true, type: String })
  title!: string;

  @Prop({ required: false, type: String })
  description?: string;

  @Prop({
    default: CrmTaskStatus.TODO,
    enum: Object.values(CrmTaskStatus),
    type: String,
  })
  status!: CrmTaskStatus;

  @Prop({
    default: CrmTaskPriority.MEDIUM,
    enum: Object.values(CrmTaskPriority),
    type: String,
  })
  priority!: CrmTaskPriority;

  @Prop({
    ref: 'Lead',
    required: false,
    type: Types.ObjectId,
  })
  lead?: Types.ObjectId;

  @Prop({
    ref: 'Company',
    required: false,
    type: Types.ObjectId,
  })
  company?: Types.ObjectId;

  @Prop({ required: false, type: String })
  assignedTo?: string;

  @Prop({ required: false, type: Date })
  dueDate?: Date;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CrmTaskSchema = SchemaFactory.createForClass(CrmTask);

CrmTaskSchema.index(
  { isDeleted: 1, organization: 1, status: 1 },
  { name: 'idx_org_status', partialFilterExpression: { isDeleted: false } },
);
