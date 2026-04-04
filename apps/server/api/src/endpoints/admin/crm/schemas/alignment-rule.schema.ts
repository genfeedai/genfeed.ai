import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AlignmentRuleDocument = AlignmentRule & Document;

@Schema({
  collection: 'alignment-rules',
  timestamps: true,
  versionKey: false,
})
export class AlignmentRule {
  @Prop({ required: true, type: String })
  key!: string;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: true, type: String })
  definition!: string;

  @Prop({ required: true, type: String })
  owner!: string;

  @Prop({
    default: 'draft',
    enum: ['approved', 'deprecated', 'draft'],
    type: String,
  })
  status!: 'approved' | 'deprecated' | 'draft';

  @Prop({ required: false, type: String })
  notes?: string;

  @Prop({ required: false, type: Date })
  effectiveDate?: Date;

  @Prop({ required: false, type: Date })
  lastReviewedAt?: Date;

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

export const AlignmentRuleSchema = SchemaFactory.createForClass(AlignmentRule);

AlignmentRuleSchema.index(
  { isDeleted: 1, key: 1, organization: 1 },
  {
    name: 'idx_alignment_rule_key',
    partialFilterExpression: { isDeleted: false },
    unique: true,
  },
);
