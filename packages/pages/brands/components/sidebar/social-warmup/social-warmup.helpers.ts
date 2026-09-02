import {
  type CredentialPlatform,
  formatPlatformLabel,
  SocialWarmupSignalStatus,
} from '@genfeedai/contracts';
import type { SocialWarmupBlueprint } from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import { isSocialWarmupEnrollmentAllowed } from '@genfeedai/contracts/api-types/contracts/social-warmup-capability.contract';
import {
  isSocialWarmupJourneyCheckBlocking,
  isSocialWarmupJourneyCheckSatisfied,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-journey.contract';
import type {
  ISocialWarmupEnrollment,
  ISocialWarmupSignal,
  SocialWarmupEventProvenance,
} from '@genfeedai/contracts/interfaces';
import type {
  BuildSocialWarmupProgramModelInput,
  ResolveSocialWarmupCheckStateInput,
  SocialWarmupBlueprintLike,
  SocialWarmupCheckUiState,
  SocialWarmupCheckView,
  SocialWarmupProgramModel,
  SocialWarmupProgress,
  SocialWarmupResolvedCheck,
} from '@props/social/social-warmup-program.props';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GRADUATION_PHASE_ID = 'graduation';

export function formatWarmupProvenanceLabel(
  provenance: SocialWarmupEventProvenance,
  platform: CredentialPlatform | string,
): string {
  if (provenance === 'platform_verified') {
    const platformLabel = formatPlatformLabel(platform) ?? String(platform);
    return `Verified from ${platformLabel}`;
  }

  if (provenance === 'genfeed_observed') {
    return 'Observed in Genfeed';
  }

  return 'You confirmed';
}

export function canRefreshAuthorizedSignals(
  platform: CredentialPlatform | string,
): boolean {
  return isSocialWarmupEnrollmentAllowed(platform);
}

export function getSocialWarmupElapsedDays(
  startedAt: string,
  now: Date = new Date(),
): number {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) {
    return 1;
  }

  return Math.max(1, Math.floor((now.getTime() - started) / MS_PER_DAY) + 1);
}

export function getSocialWarmupLastDay(
  blueprint: SocialWarmupBlueprintLike,
): number {
  const phaseEnd = Math.max(
    ...blueprint.phases.map((phase) => phase.endDay),
    1,
  );
  return Math.max(phaseEnd, blueprint.graduation.recommendedElapsedDays);
}

export function getSocialWarmupCurrentDay(
  blueprint: SocialWarmupBlueprintLike,
  startedAt: string,
  now: Date = new Date(),
): number {
  return Math.min(
    getSocialWarmupElapsedDays(startedAt, now),
    getSocialWarmupLastDay(blueprint),
  );
}

export function collectSocialWarmupChecks(
  blueprint: SocialWarmupBlueprintLike,
): SocialWarmupCheckView[] {
  const steps = blueprint.phases.flatMap((phase) =>
    phase.steps.map((step) => ({
      completionKey: step.completion.key,
      completionType: step.completion.type,
      days: [...step.days],
      description: step.description,
      id: step.id,
      kind: 'step' as const,
      phaseId: phase.id,
      phaseTitle: phase.title,
      provenance: step.provenance,
      requirement: step.requirement,
      title: step.title,
    })),
  );

  const graduation = blueprint.graduation.rules.map((rule) => ({
    completionKey: rule.completion.key,
    completionType: rule.completion.type,
    days: [],
    description: rule.description,
    id: rule.id,
    kind: 'graduation' as const,
    phaseId: GRADUATION_PHASE_ID,
    phaseTitle: 'Graduation',
    provenance: rule.provenance,
    requirement: rule.requirement,
    title: rule.title,
  }));

  return [...steps, ...graduation];
}

export function listTodaySocialWarmupChecks(
  blueprint: SocialWarmupBlueprintLike,
  currentDay: number,
): SocialWarmupCheckView[] {
  return collectSocialWarmupChecks(blueprint).filter(
    (check) => check.kind === 'step' && check.days.includes(currentDay),
  );
}

export function findSignalForCheck(
  check: Pick<SocialWarmupCheckView, 'completionKey'>,
  enrollment: ISocialWarmupEnrollment,
): ISocialWarmupSignal | undefined {
  return enrollment.signals.find(
    (signal) => signal.key === check.completionKey,
  );
}

export function isSnapshotCheck(
  check: Pick<SocialWarmupCheckView, 'completionKey' | 'id'>,
): boolean {
  return (
    check.completionKey.includes('snapshot') || check.id.includes('snapshot')
  );
}

export function isSocialWarmupCheckComplete(
  check: SocialWarmupCheckView,
  enrollment: ISocialWarmupEnrollment,
): boolean {
  return isSocialWarmupJourneyCheckSatisfied(
    {
      completionKey: check.completionKey,
      id: check.id,
      provenance: check.provenance,
    },
    enrollment,
  );
}

export function resolveSocialWarmupCheckState(
  input: ResolveSocialWarmupCheckStateInput,
): SocialWarmupCheckUiState {
  const { check, enrollment, isRefreshingSignals = false } = input;

  if (isRefreshingSignals && check.provenance !== 'user_confirmed') {
    return 'loading';
  }

  if (
    check.provenance !== 'user_confirmed' &&
    (!enrollment.isCredentialConnected ||
      enrollment.reconnect?.reason === 'disconnected')
  ) {
    return 'reconnect';
  }

  if (isSocialWarmupCheckComplete(check, enrollment)) {
    return 'complete';
  }

  if (check.provenance === 'user_confirmed') {
    return 'open';
  }

  const signal = findSignalForCheck(check, enrollment);
  const status = signal?.status;

  if (
    enrollment.hasPartialScopes ||
    status === SocialWarmupSignalStatus.PERMISSION_LIMITED ||
    enrollment.reconnect?.reason === 'partial_scopes'
  ) {
    return 'permission_limited';
  }

  if (status === SocialWarmupSignalStatus.STALE) {
    return 'stale';
  }

  if (status === SocialWarmupSignalStatus.FAILED) {
    return 'failed';
  }

  if (status === SocialWarmupSignalStatus.EMPTY) {
    return 'empty';
  }

  if (status === SocialWarmupSignalStatus.REVOKED) {
    return 'reconnect';
  }

  if (!signal || status === SocialWarmupSignalStatus.MISSING) {
    return 'missing';
  }

  return 'open';
}

export function resolveWarmupCheck(
  check: SocialWarmupCheckView,
  enrollment: ISocialWarmupEnrollment,
  platform: CredentialPlatform | string,
  isRefreshingSignals = false,
): SocialWarmupResolvedCheck {
  return {
    ...check,
    isComplete: isSocialWarmupCheckComplete(check, enrollment),
    provenanceLabel: formatWarmupProvenanceLabel(check.provenance, platform),
    signal: findSignalForCheck(check, enrollment),
    state: resolveSocialWarmupCheckState({
      check,
      enrollment,
      isRefreshingSignals,
    }),
  };
}

function isBlockingCheck(
  check: SocialWarmupResolvedCheck,
  enrollment: ISocialWarmupEnrollment,
): boolean {
  return isSocialWarmupJourneyCheckBlocking(check, enrollment);
}

export function getSocialWarmupProgress(
  checks: readonly SocialWarmupResolvedCheck[],
): SocialWarmupProgress {
  const applicable = checks.filter((check) => check.requirement !== 'optional');
  const completed = applicable.filter((check) => check.isComplete).length;
  const total = applicable.length;

  return {
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    total,
  };
}

export function getSocialWarmupLastRefreshAt(
  enrollment: ISocialWarmupEnrollment,
): string | null {
  const observed = enrollment.signals
    .map((signal) => signal.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return observed.at(-1) ?? enrollment.updatedAt ?? null;
}

export function getSocialWarmupPhaseTitle(
  blueprint: SocialWarmupBlueprintLike,
  currentDay: number,
  currentPhaseId: string,
): { id: string; title: string } {
  const byDay = blueprint.phases.find(
    (phase) => currentDay >= phase.startDay && currentDay <= phase.endDay,
  );
  if (byDay) {
    return { id: byDay.id, title: byDay.title };
  }

  const byId = blueprint.phases.find((phase) => phase.id === currentPhaseId);
  if (byId) {
    return { id: byId.id, title: byId.title };
  }

  const lastPhase = blueprint.phases.at(-1);
  return {
    id: lastPhase?.id ?? currentPhaseId,
    title: lastPhase?.title ?? currentPhaseId,
  };
}

export function getSocialWarmupNextAction(
  checks: readonly SocialWarmupResolvedCheck[],
  currentDay: number,
  currentPhaseId: string,
): SocialWarmupResolvedCheck | null {
  const incomplete = checks.filter(
    (check) => !check.isComplete && check.requirement !== 'optional',
  );

  return (
    incomplete.find(
      (check) => check.kind === 'step' && check.days.includes(currentDay),
    ) ??
    incomplete.find((check) => check.phaseId === currentPhaseId) ??
    incomplete[0] ??
    null
  );
}

export function buildSocialWarmupProgramModel(
  input: BuildSocialWarmupProgramModelInput,
): SocialWarmupProgramModel {
  const now = input.now ?? new Date();
  const currentDay = getSocialWarmupCurrentDay(
    input.blueprint,
    input.enrollment.startedAt,
    now,
  );
  const phase = getSocialWarmupPhaseTitle(
    input.blueprint,
    currentDay,
    input.enrollment.currentPhaseId,
  );
  const checks = collectSocialWarmupChecks(input.blueprint).map((check) =>
    resolveWarmupCheck(
      check,
      input.enrollment,
      input.platform,
      input.isRefreshingSignals,
    ),
  );
  const todayChecks = checks.filter(
    (check) => check.kind === 'step' && check.days.includes(currentDay),
  );

  return {
    currentDay,
    currentPhaseId: phase.id,
    currentPhaseTitle: phase.title,
    lastRefreshAt: getSocialWarmupLastRefreshAt(input.enrollment),
    nextAction: getSocialWarmupNextAction(checks, currentDay, phase.id),
    progress: getSocialWarmupProgress(checks),
    todayChecks,
    unresolvedChecks: checks.filter((check) =>
      isBlockingCheck(check, input.enrollment),
    ),
  };
}

export function resolveEnrolledBlueprint(
  enrollment: Pick<ISocialWarmupEnrollment, 'blueprintId' | 'blueprintVersion'>,
  resolveBlueprint: (reference: {
    id: string;
    version: number;
  }) => SocialWarmupBlueprint,
): SocialWarmupBlueprint | null {
  try {
    return resolveBlueprint({
      id: enrollment.blueprintId,
      version: enrollment.blueprintVersion,
    });
  } catch {
    return null;
  }
}
