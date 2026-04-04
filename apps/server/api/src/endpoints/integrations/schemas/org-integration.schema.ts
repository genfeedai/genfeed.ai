import { IntegrationPlatform, IntegrationStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type OrgIntegrationDocument = OrgIntegration & Document;

@Schema({
  collection: 'org-integrations',
  timestamps: true,
  versionKey: false,
})
export class OrgIntegration {
  _id!: string;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    enum: Object.values(IntegrationPlatform),
    required: true,
    type: String,
  })
  platform!: IntegrationPlatform;

  @Prop({
    required: true,
    type: String,
  })
  encryptedToken!: string; // Bot token, encrypted at rest

  @Prop({
    default: {},
    type: {
      allowedUserIds: [String],
      appToken: String, // For Slack socket mode
      defaultWorkflow: String,
      webhookMode: Boolean,
    },
  })
  config!: {
    allowedUserIds?: string[];
    defaultWorkflow?: string;
    webhookMode?: boolean;
    appToken?: string;
  };

  @Prop({
    default: IntegrationStatus.ACTIVE,
    enum: Object.values(IntegrationStatus),
    type: String,
  })
  status!: IntegrationStatus;

  @Prop({ type: Date })
  lastError?: Date;

  @Prop({ type: String })
  lastErrorMessage?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrgIntegrationSchema =
  SchemaFactory.createForClass(OrgIntegration);
