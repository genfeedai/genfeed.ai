/**
 * Shared social warm-up journey evaluation (#2217).
 *
 * Enrollment, publishing-hold, and checklist UI use one check-satisfaction
 * and graduation definition. Advisory completion is never a guarantee of
 * reach, distribution, or safety.
 */

import { SocialWarmupSignalStatus } from '../..';
import type {
  SocialWarmupBlueprint,
  SocialWarmupProvenance,
  SocialWarmupRequirement,
} from './social-warmup-blueprint.contract';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_HOLD_CHECK_TITLES = 3;

export const SOCIAL_WARMUP_TELEMETRY_EVENT = {
  checkCompleted: 'social_warmup.check_completed',
  checkReopened: 'social_warmup.check_reopened',
  enrolled: 'social_warmup.enrolled',
  graduated: 'social_warmup.graduated',
  override: 'social_warmup.override',
  publishingHold: 'social_warmup.publishing_hold',
  readinessTransition: 'social_warmup.readiness_transition',
  signalsRefreshed: 'social_warmup.signals_refreshed',
} as const;

export type SocialWarmupTelemetryEvent =
  (typeof SOCIAL_WARMUP_TELEMETRY_EVENT)[keyof typeof SOCIAL_WARMUP_TELEMETRY_EVENT];

export type SocialWarmupJourneyCheckKind = 'step' | 'graduation';

export interface SocialWarmupJourneyCheck {
  completionKey: string;
  id: string;
  kind: SocialWarmupJourneyCheckKind;
  provenance: SocialWarmupProvenance;
  requirement: SocialWarmupRequirement;
  title: string;
}

export interface SocialWarmupJourneySignal {
  key: string;
  status: SocialWarmupSignalStatus | string;
}

export interface SocialWarmupJourneyEnrollment {
  completedItemIds: readonly string[];
  hasPartialScopes?: boolean;
  isCredentialConnected?: boolean;
  reconnect?: { reason?: string };
  signals: readonly SocialWarmupJourneySignal[];
  startedAt: Date | string;
  state?: string;
}

export interface SocialWarmupJourneyEvaluation {
  blockingChecks: SocialWarmupJourneyCheck[];
  elapsedDays: number;
  holdReason: string | undefined;
  isGraduated: boolean;
  isReadyToGraduate: boolean;
}

const SECRET_KEY_PATTERN =
  /token|secret|password|authorization|accesskey|refreshtoken/i;

export function listSocialWarmupJourneyChecks(
  blueprint: SocialWarmupBlueprint,
): SocialWarmupJourneyCheck[] {
  const steps = blueprint.phases.flatMap((phase) =>
    phase.steps.map((step) => ({
      completionKey: step.completion.key,
      id: step.id,
      kind: 'step' as const,
      provenance: step.provenance,
      requirement: step.requirement,
      title: step.title,
    })),
  );

  const graduation = blueprint.graduation.rules.map((rule) => ({
    completionKey: rule.completion.key,
    id: rule.id,
    kind: 'graduation' as const,
    provenance: rule.provenance,
    requirement: rule.requirement,
    title: rule.title,
  }));

  return [...steps, ...graduation];
}

export function getSocialWarmupElapsedDays(
  startedAt: Date | string,
  now: Date = new Date(),
): number {
  const started = startedAt instanceof Date ? startedAt : new Date(startedAt);
  if (Number.isNaN(started.getTime())) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor((now.getTime() - started.getTime()) / MS_PER_DAY) + 1,
  );
}

export function isSocialWarmupSnapshotCheck(check: {
  completionKey: string;
  id: string;
}): boolean {
  return (
    check.completionKey.includes('snapshot') || check.id.includes('snapshot')
  );
}

export function isSocialWarmupJourneyCheckSatisfied(
  check: Pick<SocialWarmupJourneyCheck, 'completionKey' | 'id' | 'provenance'>,
  enrollment: Pick<
    SocialWarmupJourneyEnrollment,
    'completedItemIds' | 'signals'
  >,
): boolean {
  if (check.provenance === 'user_confirmed') {
    return enrollment.completedItemIds.includes(check.id);
  }

  const signal = enrollment.signals.find(
    (candidate) => candidate.key === check.completionKey,
  );
  if (!signal) {
    return enrollment.completedItemIds.includes(check.id);
  }

  if (signal.status === SocialWarmupSignalStatus.AVAILABLE) {
    return true;
  }

  return (
    signal.status === SocialWarmupSignalStatus.EMPTY &&
    isSocialWarmupSnapshotCheck(check)
  );
}

export function isSocialWarmupJourneyCheckBlocking(
  check: SocialWarmupJourneyCheck,
  enrollment: SocialWarmupJourneyEnrollment,
): boolean {
  if (check.requirement === 'optional') {
    return false;
  }

  if (isSocialWarmupJourneyCheckSatisfied(check, enrollment)) {
    return false;
  }

  if (check.requirement === 'required_when_available') {
    return !isWarmupSignalUnavailable(check, enrollment);
  }

  return true;
}

export function listBlockingSocialWarmupChecks(
  blueprint: SocialWarmupBlueprint,
  enrollment: SocialWarmupJourneyEnrollment,
): SocialWarmupJourneyCheck[] {
  return listSocialWarmupJourneyChecks(blueprint).filter((check) =>
    isSocialWarmupJourneyCheckBlocking(check, enrollment),
  );
}

export function buildSocialWarmupRequiredCheckHoldReason(
  platform: string,
  blockingChecks: readonly Pick<SocialWarmupJourneyCheck, 'title'>[],
): string {
  const titles = blockingChecks
    .slice(0, MAX_HOLD_CHECK_TITLES)
    .map((check) => check.title);
  const remaining = blockingChecks.length - titles.length;
  const listed = titles.join('; ');
  const extra =
    remaining > 0
      ? `; and ${remaining} more required check${remaining === 1 ? '' : 's'}`
      : '';

  return `${platform} publishing is held because required warm-up checks are incomplete: ${listed}${extra}. Complete the checks or confirm an expiring override after review. This does not guarantee reach or safety.`;
}

export function evaluateSocialWarmupJourney(input: {
  blueprint: SocialWarmupBlueprint;
  enrollment: SocialWarmupJourneyEnrollment;
  now?: Date;
  platform?: string;
}): SocialWarmupJourneyEvaluation {
  const now = input.now ?? new Date();
  const elapsedDays = getSocialWarmupElapsedDays(
    input.enrollment.startedAt,
    now,
  );
  const blockingChecks = listBlockingSocialWarmupChecks(
    input.blueprint,
    input.enrollment,
  );
  const isReadyToGraduate =
    blockingChecks.length === 0 &&
    elapsedDays >= input.blueprint.graduation.minimumElapsedDays &&
    input.enrollment.isCredentialConnected !== false;
  const isDisconnected = input.enrollment.state === 'DISCONNECTED';
  const isGraduated = isReadyToGraduate && !isDisconnected;
  const platform = input.platform ?? input.blueprint.platform;
  const holdReason =
    blockingChecks.length > 0
      ? buildSocialWarmupRequiredCheckHoldReason(platform, blockingChecks)
      : undefined;

  return {
    blockingChecks,
    elapsedDays,
    holdReason,
    isGraduated,
    isReadyToGraduate,
  };
}

export function sanitizeSocialWarmupTelemetry(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeValue(payload, 0) as Record<string, unknown>;
}

function isWarmupSignalUnavailable(
  check: Pick<SocialWarmupJourneyCheck, 'completionKey'>,
  enrollment: SocialWarmupJourneyEnrollment,
): boolean {
  if (
    enrollment.hasPartialScopes ||
    enrollment.reconnect?.reason === 'partial_scopes' ||
    enrollment.reconnect?.reason === 'disconnected' ||
    enrollment.isCredentialConnected === false
  ) {
    return true;
  }

  const signal = enrollment.signals.find(
    (candidate) => candidate.key === check.completionKey,
  );
  return (
    signal?.status === SocialWarmupSignalStatus.PERMISSION_LIMITED ||
    signal?.status === SocialWarmupSignalStatus.REVOKED
  );
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 4 || value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        continue;
      }
      sanitized[key] = sanitizeValue(entry, depth + 1);
    }
    return sanitized;
  }

  return value;
}
