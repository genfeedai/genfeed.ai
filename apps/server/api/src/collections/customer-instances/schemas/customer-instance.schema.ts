import type { CustomerInstance as PrismaCustomerInstance } from '@genfeedai/prisma';

export const CUSTOMER_INSTANCE_ROLES = [
  'images',
  'voices',
  'videos',
  'full',
] as const;

export const CUSTOMER_INSTANCE_TIERS = ['shared', 'dedicated'] as const;

export const CUSTOMER_INSTANCE_STATUSES = [
  'provisioning',
  'running',
  'stopped',
  'terminated',
] as const;

export type CustomerInstanceRole = (typeof CUSTOMER_INSTANCE_ROLES)[number];
export type CustomerInstanceTier = (typeof CUSTOMER_INSTANCE_TIERS)[number];
export type CustomerInstanceStatus =
  (typeof CUSTOMER_INSTANCE_STATUSES)[number];

export interface CustomerInstanceDocument
  extends Omit<PrismaCustomerInstance, 'config'> {
  _id: string;
  apiUrl?: string;
  amiId?: string;
  config?: unknown;
  instanceId?: string;
  instanceType?: string;
  organization?: string | null;
  region?: string;
  role?: CustomerInstanceRole;
  subdomain?: string;
  tier?: CustomerInstanceTier;
  [key: string]: unknown;
}

export type CustomerInstance = CustomerInstanceDocument;
