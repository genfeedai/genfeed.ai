import {
  EngagementMetric,
  EngagementRuleAction,
  EngagementRuleMode,
  EngagementRuleState,
} from '@genfeedai/contracts';
import type {
  EngagementRuleActionPayload,
  PersistEngagementRuleInput,
  UpdateEngagementRuleInput,
} from '@genfeedai/contracts/api-types/contracts/engagement-rules.contract';
import {
  engagementRuleActionPayloadSchema,
  persistEngagementRuleInputSchema,
  updateEngagementRuleInputSchema,
} from '@genfeedai/contracts/api-types/contracts/engagement-rules.contract';
import type { IEngagementMetricSnapshot } from '@genfeedai/contracts/interfaces';
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
  metric: string;
  metricSnapshot: unknown;
  mode: string;
  organizationId: string;
  postGroupId: string;
  resultingReleaseId: string | null;
  state: string;
  targetId: string;
  threshold: number;
  triggeredAt: Date | null;
  updatedAt: Date;
  userId: string;
  windowEndsAt: Date | null;
};

export function parseStoredEngagementMetric(value: string): EngagementMetric {
  switch (value) {
    case EngagementMetric.COMMENTS:
      return EngagementMetric.COMMENTS;
    case EngagementMetric.SHARES:
      return EngagementMetric.SHARES;
    case EngagementMetric.VIEWS:
      return EngagementMetric.VIEWS;
    case EngagementMetric.ENGAGEMENT_RATE:
      return EngagementMetric.ENGAGEMENT_RATE;
    default:
      return EngagementMetric.LIKES;
  }
}

export function parseStoredEngagementRuleAction(
  value: string,
): EngagementRuleAction {
  return value === EngagementRuleAction.FOLLOW_UP_COMMENT
    ? EngagementRuleAction.FOLLOW_UP_COMMENT
    : EngagementRuleAction.REPOST;
}

export function parseStoredEngagementRuleMode(
  value: string,
): EngagementRuleMode {
  return value === EngagementRuleMode.AUTO
    ? EngagementRuleMode.AUTO
    : EngagementRuleMode.APPROVAL;
}

export function parseStoredEngagementRuleState(
  value: string,
): EngagementRuleState {
  switch (value) {
    case EngagementRuleState.TRIGGERED:
      return EngagementRuleState.TRIGGERED;
    case EngagementRuleState.COMPLETED:
      return EngagementRuleState.COMPLETED;
    case EngagementRuleState.EXPIRED:
      return EngagementRuleState.EXPIRED;
    case EngagementRuleState.DISABLED:
      return EngagementRuleState.DISABLED;
    default:
      return EngagementRuleState.ARMED;
  }
}

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
