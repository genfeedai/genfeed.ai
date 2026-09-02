import { z } from 'zod';
import {
  EngagementMetric,
  EngagementRuleAction,
  EngagementRuleMode,
  EngagementRuleState,
} from '../..';

export const engagementRuleActionPayloadSchema = z.object({
  channels: z
    .array(
      z.object({
        credentialId: z.string().min(1),
        platform: z.string().min(1),
      }),
    )
    .default([]),
  commentTemplate: z.string().min(1).optional(),
});

export const persistEngagementRuleInputSchema = z.object({
  actionPayload: engagementRuleActionPayloadSchema.default({ channels: [] }),
  actionType: z.nativeEnum(EngagementRuleAction),
  brandId: z.string().min(1).optional(),
  isEnabled: z.boolean().optional(),
  metric: z.nativeEnum(EngagementMetric),
  mode: z.nativeEnum(EngagementRuleMode).default(EngagementRuleMode.APPROVAL),
  postGroupId: z.string().min(1),
  targetId: z.string().min(1),
  threshold: z.number().nonnegative(),
  windowEndsAt: z.string().datetime({ offset: true }).optional(),
});

export const updateEngagementRuleInputSchema = persistEngagementRuleInputSchema
  .omit({ postGroupId: true, targetId: true })
  .partial();

export type PersistEngagementRuleInput = z.infer<
  typeof persistEngagementRuleInputSchema
>;
export type UpdateEngagementRuleInput = z.infer<
  typeof updateEngagementRuleInputSchema
>;
export type EngagementRuleActionPayload = z.infer<
  typeof engagementRuleActionPayloadSchema
>;

export interface EngagementMetricSnapshot {
  comments: number;
  engagementRate: number;
  likes: number;
  shares: number;
  views: number;
}

export interface EngagementCredentialEligibility {
  canWriteComments: boolean;
  canWriteReposts: boolean;
  isConnected: boolean;
}

export interface EvaluateEngagementRuleInput {
  eligibility: EngagementCredentialEligibility;
  now: Date;
  rule: {
    actionType: EngagementRuleAction;
    isEnabled: boolean;
    metric: EngagementMetric;
    state: EngagementRuleState;
    threshold: number;
    windowEndsAt: Date | null;
  };
  snapshot: EngagementMetricSnapshot;
}

export type EvaluateEngagementRuleResult =
  | { kind: 'skip' }
  | { kind: 'expire' }
  | {
      kind: 'fire';
      snapshot: EngagementMetricSnapshot;
    }
  | { kind: 'ineligible'; reason: string };

function metricValue(
  metric: EngagementMetric,
  snapshot: EngagementMetricSnapshot,
): number {
  switch (metric) {
    case EngagementMetric.LIKES:
      return snapshot.likes;
    case EngagementMetric.COMMENTS:
      return snapshot.comments;
    case EngagementMetric.SHARES:
      return snapshot.shares;
    case EngagementMetric.VIEWS:
      return snapshot.views;
    case EngagementMetric.ENGAGEMENT_RATE:
      return snapshot.engagementRate;
  }
}

/**
 * At-most-once evaluation. Armed rules fire once, expire at the window, and
 * never re-arm after an ineligible credential — the failure is recorded so
 * the operator can see it.
 */
export function evaluateEngagementRule(
  input: EvaluateEngagementRuleInput,
): EvaluateEngagementRuleResult {
  const { eligibility, now, rule, snapshot } = input;

  if (!rule.isEnabled || rule.state !== EngagementRuleState.ARMED) {
    return { kind: 'skip' };
  }

  if (rule.windowEndsAt && now.getTime() >= rule.windowEndsAt.getTime()) {
    return { kind: 'expire' };
  }

  if (metricValue(rule.metric, snapshot) < rule.threshold) {
    return { kind: 'skip' };
  }

  if (!eligibility.isConnected) {
    return {
      kind: 'ineligible',
      reason: 'Connected credential is disconnected.',
    };
  }

  if (
    rule.actionType === EngagementRuleAction.FOLLOW_UP_COMMENT &&
    !eligibility.canWriteComments
  ) {
    return {
      kind: 'ineligible',
      reason: 'Credential cannot write comments.',
    };
  }

  if (
    rule.actionType === EngagementRuleAction.REPOST &&
    !eligibility.canWriteReposts
  ) {
    return {
      kind: 'ineligible',
      reason: 'Credential cannot write reposts.',
    };
  }

  return { kind: 'fire', snapshot };
}
