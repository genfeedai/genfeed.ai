import type { Prisma } from '@genfeedai/prisma';

export type QueueSystemEmailInput = {
  userId: string;
  organizationId: string;
  topic: string;
  templateKey: string;
  subject: string;
  html: string;
  text?: string;
  destinationUrl: string;
  goal?: string;
  idempotencyKey: string;
  dueAt?: Date;
  policyData?: Prisma.InputJsonValue;
  lifecycleDeliveryId?: string;
};

export type EmailConversionInput = {
  userId: string;
  organizationId: string;
  goal: string;
  sourceId: string;
  occurredAt?: Date;
  value?: number;
};

export type SignedEmailWebhookHeaders = {
  id?: string;
  timestamp?: string;
  signature?: string;
};
