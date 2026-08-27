import type {
  EngagementRuleActionPayload,
  PersistEngagementRuleInput,
  UpdateEngagementRuleInput,
} from '@api-types/contracts/engagement-rules.contract';
import {
  engagementRuleActionPayloadSchema,
  persistEngagementRuleInputSchema,
  updateEngagementRuleInputSchema,
} from '@api-types/contracts/engagement-rules.contract';
import type {
  EngagementMetric,
  EngagementRuleMode,
  EngagementRuleState,
} from '@genfeedai/enums';
import type { IEngagementMetricSnapshot } from '@genfeedai/interfaces';
import { BadRequestException } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

export type StoredEngagementRuleRow = {
  actionPayload: unknown;
  actionType: string;
  brandId: string | null;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  isEnabled: boolean;
  lastError: string | null;
  metric: EngagementMetric;
  metricSnapshot: unknown;
  mode: EngagementRuleMode;
  organizationId: string;
  postGroupId: string;
  resultingReleaseId: string | null;
  state: EngagementRuleState;
  targetId: string;
  threshold: number;
  triggeredAt: Date | null;
  updatedAt: Date;
  userId: string;
  windowEndsAt: Date | null;
};

function badRequestFromZod(
  error: ZodError,
  title: string,
): BadRequestException {
  return new BadRequestException({
    detail: error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; '),
    title,
  });
}

export function parseContractInput<T>(
  schema: ZodType<T>,
  value: unknown,
  title: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw badRequestFromZod(parsed.error, title);
  }
  return parsed.data;
}

export function parseCreateEngagementRuleInput(
  value: unknown,
): PersistEngagementRuleInput {
  return parseContractInput(
    persistEngagementRuleInputSchema,
    value,
    'Invalid engagement rule payload',
  );
}

export function parseUpdateEngagementRuleInput(
  value: unknown,
): UpdateEngagementRuleInput {
  return parseContractInput(
    updateEngagementRuleInputSchema,
    value,
    'Invalid engagement rule payload',
  );
}

export function parseActionPayload(
  value: unknown,
): EngagementRuleActionPayload {
  const parsed = engagementRuleActionPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : { channels: [] };
}

export function parseMetricSnapshot(
  value: unknown,
): IEngagementMetricSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const snapshot = value as Record<string, unknown>;
  const comments = snapshot.comments;
  const engagementRate = snapshot.engagementRate;
  const likes = snapshot.likes;
  const shares = snapshot.shares;
  const views = snapshot.views;
  if (
    typeof comments !== 'number' ||
    typeof engagementRate !== 'number' ||
    typeof likes !== 'number' ||
    typeof shares !== 'number' ||
    typeof views !== 'number'
  ) {
    return null;
  }
  return { comments, engagementRate, likes, shares, views };
}
