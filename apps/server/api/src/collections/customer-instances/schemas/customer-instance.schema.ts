import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document } from 'mongoose';

export type CustomerInstanceDocument = CustomerInstance & Document;

export type CustomerInstanceRole = 'images' | 'voices' | 'videos' | 'full';
export type CustomerInstanceStatus =
  | 'provisioning'
  | 'running'
  | 'stopped'
  | 'terminated';
export type CustomerInstanceTier = 'shared' | 'dedicated';

@Schema({
  collection: 'customer-instances',
  timestamps: true,
  versionKey: false,
})
export class CustomerInstance {
  _id!: string;

  /** Clerk organization ID of the customer that owns this instance */
  @Prop({ index: true, required: true, type: String })
  organizationId!: string;

  /** AWS EC2 instance ID (e.g. i-0abc123def456) */
  @Prop({ required: true, type: String, unique: true })
  instanceId!: string;

  /** EC2 instance type (e.g. g6e.xlarge) */
  @Prop({ required: true, type: String })
  instanceType!: string;

  /** AWS region (e.g. us-east-1) */
  @Prop({ default: 'us-east-1', type: String })
  region!: string;

  /** AMI used to launch the instance */
  @Prop({ required: true, type: String })
  amiId!: string;

  /** What generation workload runs on this instance */
  @Prop({
    default: 'full',
    enum: [
      'images',
      'voices',
      'videos',
      'full',
    ] satisfies CustomerInstanceRole[],
    required: true,
    type: String,
  })
  role!: CustomerInstanceRole;

  /** Customer-facing subdomain (e.g. acme.gpu.genfeed.ai) */
  @Prop({ required: true, type: String })
  subdomain!: string;

  /** Full API base URL (e.g. https://acme.gpu.genfeed.ai) */
  @Prop({ required: true, type: String })
  apiUrl!: string;

  /** Whether this is a shared or dedicated instance */
  @Prop({
    default: 'dedicated',
    enum: ['shared', 'dedicated'] satisfies CustomerInstanceTier[],
    type: String,
  })
  tier!: CustomerInstanceTier;

  /** Current lifecycle status */
  @Prop({
    default: 'provisioning',
    enum: [
      'provisioning',
      'running',
      'stopped',
      'terminated',
    ] satisfies CustomerInstanceStatus[],
    index: true,
    required: true,
    type: String,
  })
  status!: CustomerInstanceStatus;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ type: Date })
  lastStartedAt?: Date;

  @Prop({ type: Date })
  lastStoppedAt?: Date;
}

export const CustomerInstanceSchema =
  SchemaFactory.createForClass(CustomerInstance);
