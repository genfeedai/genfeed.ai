import { ContentPlanStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ContentPlanDocument = ContentPlan & Document;

@Schema({
  collection: 'content-plans',
  timestamps: true,
  versionKey: false,
})
export class ContentPlan {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({ ref: 'User', type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({
    default: ContentPlanStatus.DRAFT,
    enum: Object.values(ContentPlanStatus),
    type: String,
  })
  status!: ContentPlanStatus;

  @Prop({ required: true, type: Date })
  periodStart!: Date;

  @Prop({ required: true, type: Date })
  periodEnd!: Date;

  @Prop({ default: 0, type: Number })
  itemCount!: number;

  @Prop({ default: 0, type: Number })
  executedCount!: number;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ContentPlanSchema = SchemaFactory.createForClass(ContentPlan);
