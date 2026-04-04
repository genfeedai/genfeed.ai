import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CostRecordDocument = CostRecord & Document;

@Schema({
  collection: 'cost-records',
  timestamps: true,
  versionKey: false,
})
export class CostRecord {
  @Prop({ required: true, type: String })
  category!: string;

  @Prop({ required: true, type: Number })
  amount!: number;

  @Prop({ required: false, type: String })
  currency?: string;

  @Prop({ required: false, type: String })
  description?: string;

  @Prop({ required: false, type: String })
  vendor?: string;

  @Prop({ required: true, type: Date })
  date!: Date;

  @Prop({ default: false, type: Boolean })
  isRecurring!: boolean;

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

export const CostRecordSchema = SchemaFactory.createForClass(CostRecord);

CostRecordSchema.index(
  { date: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_date', partialFilterExpression: { isDeleted: false } },
);
