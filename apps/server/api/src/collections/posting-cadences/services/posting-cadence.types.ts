import type { Prisma } from '@genfeedai/prisma';

export type CadenceRecord = {
  brief: string | null;
  brandId: string;
  createdAt: Date;
  credentialId: string;
  endsAt: Date | null;
  format: string;
  generateLanding: string;
  id: string;
  intervalMinutes: number;
  isDeleted: boolean;
  label: string | null;
  maxOccurrences: number | null;
  organizationId: string;
  startsAt: Date;
  status: string;
  timezone: string;
  updatedAt: Date;
  userId: string;
  windowEndMinute: number;
  windowStartMinute: number;
};

export type ReservationRecord = {
  brandId: string;
  cadenceId: string | null;
  credentialId: string;
  format: string;
  generatedItemId: string | null;
  generatedItemType: string | null;
  id: string;
  identityKey: string;
  instant: Date;
  lastFailureReason: string | null;
  state: string;
  timezone: string;
};

export type CadenceDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<CadenceRecord>;
  findFirst: (args: {
    where: Record<string, unknown>;
  }) => Promise<CadenceRecord | null>;
  findMany: (args: {
    orderBy?: unknown;
    where: Record<string, unknown>;
  }) => Promise<CadenceRecord[]>;
  update: (args: {
    data: Record<string, unknown>;
    where: Record<string, unknown>;
  }) => Promise<CadenceRecord>;
};

export type ReservationDelegate = {
  findFirst: (args: {
    where: Record<string, unknown>;
  }) => Promise<ReservationRecord | null>;
  findMany: (args: {
    where: Record<string, unknown>;
  }) => Promise<ReservationRecord[]>;
  upsert: (args: {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    where: {
      organizationId_identityKey: {
        identityKey: string;
        organizationId: string;
      };
    };
  }) => Promise<ReservationRecord>;
  updateMany: (args: {
    data: Record<string, unknown>;
    where: Record<string, unknown>;
  }) => Promise<{ count: number }>;
};

export type MatchingTarget = {
  category: string | null;
  credentialId: string | null;
  groupId: string | null;
  id: string;
  scheduledDate: Date | null;
};

export type BrandContextRow = {
  agentConfig: Prisma.JsonValue;
  description: string | null;
  label: string;
  text: string | null;
};

export type ScheduledCampaignRow = {
  description: string;
  scheduledDate: Date | null;
};

export type TextPricedModel = {
  cost?: number | null;
  inputCostPerMillionTokens?: number | null;
  minCost?: number | null;
  outputCostPerMillionTokens?: number | null;
  pricingType?: string | null;
};
