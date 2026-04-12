import {
  LeadSource,
  LeadStatus,
  ProactiveOnboardingStatus,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type LeadDocument = Lead & Document;

@Schema({
  collection: 'leads',
  timestamps: true,
  versionKey: false,
})
export class Lead {
  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: false, type: String })
  email?: string;

  @Prop({ required: false, type: String })
  phone?: string;

  @Prop({ required: false, type: String })
  company?: string;

  @Prop({
    ref: 'Company',
    required: false,
    type: Types.ObjectId,
  })
  companyRef?: Types.ObjectId;

  @Prop({ required: false, type: String })
  title?: string;

  @Prop({
    default: LeadStatus.NEW,
    enum: Object.values(LeadStatus),
    required: true,
    type: String,
  })
  status!: LeadStatus;

  @Prop({
    enum: Object.values(LeadSource),
    required: false,
    type: String,
  })
  source?: LeadSource;

  @Prop({ required: false, type: Number })
  dealValue?: number;

  @Prop({ required: false, type: String })
  currency?: string;

  @Prop({ required: false, type: String })
  notes?: string;

  @Prop({ required: false, type: String })
  productOffering?: string;

  @Prop({ required: false, type: String })
  twitterHandle?: string;

  @Prop({ required: false, type: String })
  instagramHandle?: string;

  @Prop({ required: false, type: String })
  discordHandle?: string;

  @Prop({ required: false, type: String })
  telegramHandle?: string;

  @Prop({ required: false, type: Date })
  contactDate?: Date;

  @Prop({ default: [], type: [String] })
  tags!: string[];

  @Prop({ required: false, type: String })
  assignedTo?: string;

  @Prop({ required: false, type: Date })
  lastContactedAt?: Date;

  @Prop({ required: false, type: Date })
  nextFollowUpAt?: Date;

  @Prop({ required: false, type: String })
  brandUrl?: string;

  @Prop({
    ref: 'Organization',
    required: false,
    type: Types.ObjectId,
  })
  proactiveOrganization?: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  proactiveBrand?: Types.ObjectId;

  @Prop({
    default: ProactiveOnboardingStatus.NONE,
    enum: Object.values(ProactiveOnboardingStatus),
    required: true,
    type: String,
  })
  proactiveStatus!: ProactiveOnboardingStatus;

  @Prop({ required: false, type: String })
  proactiveBatchId?: string;

  @Prop({ required: false, type: Date })
  invitedAt?: Date;

  @Prop({ required: false, type: Date })
  claimedAt?: Date;

  @Prop({ required: false, type: Date })
  paymentMadeAt?: Date;

  @Prop({ required: false, type: Date })
  convertedAt?: Date;

  @Prop({ required: false, type: Date })
  lastOutreachSentAt?: Date;

  @Prop({ required: false, type: Date })
  lastOutreachFailedAt?: Date;

  @Prop({ required: false, type: String })
  lastOutreachStatus?: 'failed' | 'sent';

  @Prop({ required: false, type: String })
  lastOutreachMessageId?: string;

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

export const LeadSchema = SchemaFactory.createForClass(Lead);

LeadSchema.index(
  { isDeleted: 1, organization: 1, status: 1 },
  { name: 'idx_org_status', partialFilterExpression: { isDeleted: false } },
);
