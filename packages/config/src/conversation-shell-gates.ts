import {
  CONVERSATION_SHELL_COHORTS,
  CONVERSATION_SHELL_DEPLOYMENT_ORDER,
  type ConversationShellCohort,
  type ConversationShellDeploymentMode,
} from './conversation-shell-rollout';

export type ConversationShellGateStatus =
  | 'fail'
  | 'insufficient_observation'
  | 'pass';

export interface ConversationShellGateSnapshot {
  readonly approvalPinIntegrity: {
    readonly exactMatches: number;
    readonly attempts: number;
  };
  readonly cohort: ConversationShellCohort;
  readonly compatibilityReads: {
    readonly eligibleReads: number;
    readonly legacyReads: number;
  };
  readonly denominatorSnapshotId: string;
  readonly deploymentMode: ConversationShellDeploymentMode;
  readonly fallbackUsage: {
    readonly enabledSessions: number;
    readonly fallbackSessions: number;
  };
  readonly firstUsefulPaint: {
    readonly legacyObservations: number;
    readonly legacyP75Ms: number;
    readonly legacyP95Ms: number;
    readonly shellObservations: number;
    readonly shellP75Ms: number;
    readonly shellP95Ms: number;
  };
  readonly manualValidation: {
    readonly accessibilityPassed: boolean;
    readonly responsivePassed: boolean;
    readonly rollbackRehearsalPassed: boolean;
  };
  readonly observationWindow: {
    readonly completeUtcDays: number;
    readonly end: string;
    readonly start: string;
  };
  readonly protectedRouteParity: {
    readonly passed: number;
    readonly total: number;
  };
  readonly restoration: {
    readonly enabledSessions: number;
    readonly failures: number;
    readonly transitions: number;
  };
  readonly scopeSafety: {
    readonly attempts: number;
    readonly violations: number;
  };
  readonly staleContext: {
    readonly attempts: number;
    readonly blocked: number;
  };
  readonly telemetryQueryVersion: 1;
}

export type ConversationShellGateName =
  | 'accessibility'
  | 'approval_pin_integrity'
  | 'compatibility_reads'
  | 'fallback_usage'
  | 'first_useful_paint'
  | 'observation_window'
  | 'protected_route_parity'
  | 'responsive'
  | 'rollback_rehearsal'
  | 'scope_violations'
  | 'stale_context_enforcement'
  | 'url_restoration_failures';

export interface ConversationShellGateResult {
  readonly detail: string;
  readonly name: ConversationShellGateName;
  readonly status: ConversationShellGateStatus;
}

export interface ConversationShellGateReport {
  readonly cohort: ConversationShellCohort;
  readonly denominatorSnapshotId: string;
  readonly deploymentMode: ConversationShellDeploymentMode;
  readonly gates: readonly ConversationShellGateResult[];
  readonly passed: boolean;
  readonly telemetryQueryVersion: 1;
}

const DAY_MS = 86_400_000;
const REQUIRED_OBSERVATION_DAYS = 14;
const SAFE_SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : Number.POSITIVE_INFINITY;
}

function assertValidSnapshot(snapshot: ConversationShellGateSnapshot): void {
  const counts = [
    snapshot.approvalPinIntegrity.exactMatches,
    snapshot.approvalPinIntegrity.attempts,
    snapshot.compatibilityReads.eligibleReads,
    snapshot.compatibilityReads.legacyReads,
    snapshot.fallbackUsage.enabledSessions,
    snapshot.fallbackUsage.fallbackSessions,
    snapshot.firstUsefulPaint.legacyObservations,
    snapshot.firstUsefulPaint.shellObservations,
    snapshot.observationWindow.completeUtcDays,
    snapshot.protectedRouteParity.passed,
    snapshot.protectedRouteParity.total,
    snapshot.restoration.enabledSessions,
    snapshot.restoration.failures,
    snapshot.restoration.transitions,
    snapshot.scopeSafety.attempts,
    snapshot.scopeSafety.violations,
    snapshot.staleContext.attempts,
    snapshot.staleContext.blocked,
  ];
  const durations = [
    snapshot.firstUsefulPaint.legacyP75Ms,
    snapshot.firstUsefulPaint.legacyP95Ms,
    snapshot.firstUsefulPaint.shellP75Ms,
    snapshot.firstUsefulPaint.shellP95Ms,
  ];

  if (
    snapshot.telemetryQueryVersion !== 1 ||
    !CONVERSATION_SHELL_COHORTS.includes(snapshot.cohort) ||
    !CONVERSATION_SHELL_DEPLOYMENT_ORDER.includes(snapshot.deploymentMode) ||
    !SAFE_SNAPSHOT_ID_PATTERN.test(snapshot.denominatorSnapshotId) ||
    !counts.every(
      (value) => Number.isSafeInteger(value) && isFiniteNonNegative(value),
    ) ||
    !durations.every(isFiniteNonNegative) ||
    typeof snapshot.manualValidation.accessibilityPassed !== 'boolean' ||
    typeof snapshot.manualValidation.responsivePassed !== 'boolean' ||
    typeof snapshot.manualValidation.rollbackRehearsalPassed !== 'boolean' ||
    snapshot.approvalPinIntegrity.exactMatches >
      snapshot.approvalPinIntegrity.attempts ||
    snapshot.compatibilityReads.legacyReads >
      snapshot.compatibilityReads.eligibleReads ||
    snapshot.fallbackUsage.fallbackSessions >
      snapshot.fallbackUsage.enabledSessions ||
    snapshot.protectedRouteParity.passed >
      snapshot.protectedRouteParity.total ||
    snapshot.restoration.failures > snapshot.restoration.transitions ||
    snapshot.scopeSafety.violations > snapshot.scopeSafety.attempts ||
    snapshot.staleContext.blocked > snapshot.staleContext.attempts
  ) {
    throw new Error(
      'Conversation shell gate snapshot contains invalid or contradictory values.',
    );
  }
}

function result(
  name: ConversationShellGateName,
  status: ConversationShellGateStatus,
  detail: string,
): ConversationShellGateResult {
  return { detail, name, status };
}

function evaluateObservationWindow(
  snapshot: ConversationShellGateSnapshot,
  now: Date,
): ConversationShellGateResult {
  const start = new Date(snapshot.observationWindow.start);
  const end = new Date(snapshot.observationWindow.end);
  const currentCompleteUtcDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const isCompleteUtcBoundary =
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    start.getTime() % DAY_MS === 0 &&
    end.getTime() % DAY_MS === 0 &&
    end.getTime() <= currentCompleteUtcDay;
  const elapsedDays = (end.getTime() - start.getTime()) / DAY_MS;

  if (
    !isCompleteUtcBoundary ||
    snapshot.observationWindow.completeUtcDays < REQUIRED_OBSERVATION_DAYS ||
    snapshot.observationWindow.completeUtcDays !== elapsedDays ||
    elapsedDays < REQUIRED_OBSERVATION_DAYS
  ) {
    return result(
      'observation_window',
      'insufficient_observation',
      'Requires 14 complete UTC days ending no later than the current complete UTC day.',
    );
  }

  return result(
    'observation_window',
    'pass',
    `${snapshot.observationWindow.completeUtcDays} complete UTC days observed.`,
  );
}

function minimumStatus(
  observed: number,
  minimum: number,
): ConversationShellGateStatus | null {
  return isFiniteNonNegative(observed) && observed >= minimum
    ? null
    : 'insufficient_observation';
}

export function evaluateConversationShellGates(
  snapshot: ConversationShellGateSnapshot,
  now = new Date(),
): ConversationShellGateReport {
  assertValidSnapshot(snapshot);
  const gates: ConversationShellGateResult[] = [];
  const observationWindow = evaluateObservationWindow(snapshot, now);
  gates.push(observationWindow);

  gates.push(
    result(
      'protected_route_parity',
      snapshot.protectedRouteParity.total > 0 &&
        snapshot.protectedRouteParity.passed ===
          snapshot.protectedRouteParity.total
        ? 'pass'
        : 'fail',
      `${snapshot.protectedRouteParity.passed}/${snapshot.protectedRouteParity.total} protected routes passed direct-link, enabled-shell, fallback, and authorization checks.`,
    ),
  );

  const scopeMinimum = minimumStatus(snapshot.scopeSafety.attempts, 1_000);
  gates.push(
    result(
      'scope_violations',
      scopeMinimum ?? (snapshot.scopeSafety.violations === 0 ? 'pass' : 'fail'),
      `${snapshot.scopeSafety.violations} violations across ${snapshot.scopeSafety.attempts} consequential attempts.`,
    ),
  );

  const staleMinimum = minimumStatus(snapshot.staleContext.attempts, 100);
  gates.push(
    result(
      'stale_context_enforcement',
      staleMinimum ??
        (snapshot.staleContext.blocked === snapshot.staleContext.attempts
          ? 'pass'
          : 'fail'),
      `${snapshot.staleContext.blocked}/${snapshot.staleContext.attempts} stale consequential attempts blocked before side effects.`,
    ),
  );

  const restorationMinimum =
    minimumStatus(snapshot.restoration.transitions, 2_000) ??
    minimumStatus(snapshot.restoration.enabledSessions, 100);
  const restorationRate = ratio(
    snapshot.restoration.failures,
    snapshot.restoration.transitions,
  );
  gates.push(
    result(
      'url_restoration_failures',
      restorationMinimum ?? (restorationRate < 0.005 ? 'pass' : 'fail'),
      `${snapshot.restoration.failures}/${snapshot.restoration.transitions} eligible transitions (${(restorationRate * 100).toFixed(3)}%).`,
    ),
  );

  const fallbackMinimum = minimumStatus(
    snapshot.fallbackUsage.enabledSessions,
    1_000,
  );
  const fallbackRate = ratio(
    snapshot.fallbackUsage.fallbackSessions,
    snapshot.fallbackUsage.enabledSessions,
  );
  gates.push(
    result(
      'fallback_usage',
      fallbackMinimum ?? (fallbackRate < 0.01 ? 'pass' : 'fail'),
      `${snapshot.fallbackUsage.fallbackSessions}/${snapshot.fallbackUsage.enabledSessions} enabled sessions (${(fallbackRate * 100).toFixed(3)}%).`,
    ),
  );

  const compatibilityMinimum = minimumStatus(
    snapshot.compatibilityReads.eligibleReads,
    10_000,
  );
  const compatibilityRate = ratio(
    snapshot.compatibilityReads.legacyReads,
    snapshot.compatibilityReads.eligibleReads,
  );
  gates.push(
    result(
      'compatibility_reads',
      compatibilityMinimum ?? (compatibilityRate < 0.01 ? 'pass' : 'fail'),
      `${snapshot.compatibilityReads.legacyReads}/${snapshot.compatibilityReads.eligibleReads} eligible reads (${(compatibilityRate * 100).toFixed(3)}%).`,
    ),
  );

  const performanceMinimum =
    minimumStatus(snapshot.firstUsefulPaint.shellObservations, 1_000) ??
    minimumStatus(snapshot.firstUsefulPaint.legacyObservations, 1_000);
  const performanceValues = [
    snapshot.firstUsefulPaint.shellP75Ms,
    snapshot.firstUsefulPaint.shellP95Ms,
    snapshot.firstUsefulPaint.legacyP75Ms,
    snapshot.firstUsefulPaint.legacyP95Ms,
  ];
  const performancePassed =
    performanceValues.every(isFiniteNonNegative) &&
    snapshot.firstUsefulPaint.legacyP75Ms > 0 &&
    snapshot.firstUsefulPaint.legacyP95Ms > 0 &&
    snapshot.firstUsefulPaint.shellP75Ms <=
      snapshot.firstUsefulPaint.legacyP75Ms * 1.1 &&
    snapshot.firstUsefulPaint.shellP95Ms <=
      snapshot.firstUsefulPaint.legacyP95Ms * 1.15;
  gates.push(
    result(
      'first_useful_paint',
      performanceMinimum ?? (performancePassed ? 'pass' : 'fail'),
      `Shell p75/p95 ${snapshot.firstUsefulPaint.shellP75Ms}/${snapshot.firstUsefulPaint.shellP95Ms}ms; legacy ${snapshot.firstUsefulPaint.legacyP75Ms}/${snapshot.firstUsefulPaint.legacyP95Ms}ms.`,
    ),
  );

  const approvalMinimum = minimumStatus(
    snapshot.approvalPinIntegrity.attempts,
    100,
  );
  gates.push(
    result(
      'approval_pin_integrity',
      approvalMinimum ??
        (snapshot.approvalPinIntegrity.exactMatches ===
        snapshot.approvalPinIntegrity.attempts
          ? 'pass'
          : 'fail'),
      `${snapshot.approvalPinIntegrity.exactMatches}/${snapshot.approvalPinIntegrity.attempts} version-bound executions matched exact digest and scope.`,
    ),
  );

  gates.push(
    result(
      'accessibility',
      snapshot.manualValidation.accessibilityPassed ? 'pass' : 'fail',
      'WCAG keyboard, screen-reader, focus, status, and contrast validation.',
    ),
    result(
      'responsive',
      snapshot.manualValidation.responsivePassed ? 'pass' : 'fail',
      'Responsive validation across supported shell states and deployment modes.',
    ),
    result(
      'rollback_rehearsal',
      snapshot.manualValidation.rollbackRehearsalPassed ? 'pass' : 'fail',
      'Rollback rehearsal preserved existing threads, artifacts, drafts, and deep links.',
    ),
  );

  const observationPassed = observationWindow.status === 'pass';
  return {
    cohort: snapshot.cohort,
    denominatorSnapshotId: snapshot.denominatorSnapshotId,
    deploymentMode: snapshot.deploymentMode,
    gates,
    passed: observationPassed && gates.every((gate) => gate.status === 'pass'),
    telemetryQueryVersion: 1,
  };
}
