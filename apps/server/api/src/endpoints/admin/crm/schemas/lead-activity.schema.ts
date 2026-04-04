import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, type Mixed, Types } from 'mongoose';

export type LeadActivityDocument = LeadActivity & Document;

@Schema({
  collection: 'lead-activities',
  timestamps: true,
  versionKey: false,
})
export class LeadActivity {
  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ required: true, type: String })
  createdBy!: string;

  @Prop({
    ref: 'Lead',
    required: true,
    type: Types.ObjectId,
  })
  lead!: Types.ObjectId;

  @Prop({
    required: false,
    type: Object,
  })
  metadata?: Mixed;

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

export const LeadActivitySchema = SchemaFactory.createForClass(LeadActivity);

LeadActivitySchema.index(
  { isDeleted: 1, lead: 1, organization: 1 },
  { name: 'idx_lead_org', partialFilterExpression: { isDeleted: false } },
);
