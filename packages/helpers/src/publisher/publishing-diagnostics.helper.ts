import type {
  IPublishingDiagnostic,
  IPublishingProviderReadiness,
  IPublishingSetupCheck,
  PublishingReadinessState,
  PublishingSetupCheckStatus,
  PublishingSetupFailureClassification,
} from '@genfeedai/contracts/interfaces';

import { redactSensitiveValue } from '../security/redact-sensitive-value.helper';

const BLOCKING_CLASSIFICATIONS = new Set<PublishingSetupFailureClassification>([
  'expired_credential',
  'missing_permission_scope',
  'missing_provider_approval',
  'misconfiguration',
  'unsupported_self_host_mode',
]);

export interface PublishingDiagnosticClassificationInput {
  code?: string | null;
  message?: string | null;
  statusCode?: number | null;
}

export type PublishingReadinessInput = Omit<
  IPublishingProviderReadiness,
  | 'appReviewStatus'
  | 'callbackUrlStatus'
  | 'canSchedule'
  | 'diagnostics'
  | 'isRetryable'
  | 'permissionScopeStatus'
  | 'quotaStatus'
  | 'state'
  | 'tokenFreshness'
> & {
  appReviewStatus?: PublishingSetupCheckStatus;
  callbackUrlStatus?: PublishingSetupCheckStatus;
  diagnostics?: IPublishingDiagnostic[];
  permissionScopeStatus?: PublishingSetupCheckStatus;
  quotaStatus?: PublishingSetupCheckStatus;
  tokenFreshness?: PublishingSetupCheckStatus;
};

export function redactPublishingDiagnosticValue(value: unknown): unknown {
  return redactSensitiveValue(value);
}

export function sanitizePublishingDiagnostic(
  diagnostic: IPublishingDiagnostic,
): IPublishingDiagnostic {
  return {
    ...diagnostic,
    details: diagnostic.details
      ? (redactPublishingDiagnosticValue(diagnostic.details) as Record<
          string,
          unknown
        >)
      : undefined,
  };
}

export function sanitizePublishingDiagnostics(
  diagnostics: readonly IPublishingDiagnostic[],
): IPublishingDiagnostic[] {
  return diagnostics.map((diagnostic) =>
    sanitizePublishingDiagnostic(diagnostic),
  );
}

export function classifyPublishingReadiness(
  diagnostics: readonly IPublishingDiagnostic[],
): PublishingReadinessState {
  if (diagnostics.length === 0) {
    return 'publish_capable';
  }

  if (
    diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === 'error' &&
        (!diagnostic.isRetryable ||
          BLOCKING_CLASSIFICATIONS.has(diagnostic.classification)),
    )
  ) {
    return 'blocked';
  }

  if (
    diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === 'warning' || diagnostic.severity === 'error',
    )
  ) {
    return 'degraded';
  }

  return 'publish_capable';
}

/**
 * Checklist-level counterpart of {@link classifyPublishingReadiness}. Setup
 * checks already carry an explicit status, so the worst status wins rather than
 * re-deriving severity from diagnostics: a failing dependency blocks publishing
 * even when its diagnostic is retryable.
 */
export function classifyPublishingSetupChecklistState(
  checks: readonly IPublishingSetupCheck[],
): PublishingReadinessState {
  if (checks.length === 0) {
    return 'unknown';
  }

  if (checks.some((check) => check.status === 'fail')) {
    return 'blocked';
  }

  if (checks.some((check) => check.status === 'warn')) {
    return 'degraded';
  }

  if (checks.some((check) => check.status === 'unknown')) {
    return 'unknown';
  }

  return 'publish_capable';
}

export function canScheduleWithPublishingReadiness(
  state: PublishingReadinessState,
): boolean {
  return state === 'publish_capable' || state === 'degraded';
}

function inferRetryability(
  state: PublishingReadinessState,
  diagnostics: readonly IPublishingDiagnostic[],
): boolean {
  if (state === 'publish_capable') {
    return false;
  }

  return diagnostics.some((diagnostic) => diagnostic.isRetryable);
}

function getFirstRequiredAction(
  diagnostics: readonly IPublishingDiagnostic[],
): string | null {
  return (
    diagnostics.find((diagnostic) => diagnostic.correctiveAction)
      ?.correctiveAction ?? null
  );
}

function defaultStatus(
  status: PublishingSetupCheckStatus | undefined,
): PublishingSetupCheckStatus {
  return status ?? 'unknown';
}

export function buildPublishingProviderReadiness(
  input: PublishingReadinessInput,
): IPublishingProviderReadiness {
  const diagnostics = sanitizePublishingDiagnostics(input.diagnostics ?? []);
  const state = classifyPublishingReadiness(diagnostics);

  return {
    ...input,
    appReviewStatus: defaultStatus(input.appReviewStatus),
    callbackUrlStatus: defaultStatus(input.callbackUrlStatus),
    canSchedule: canScheduleWithPublishingReadiness(state),
    diagnostics,
    isRetryable: inferRetryability(state, diagnostics),
    permissionScopeStatus: defaultStatus(input.permissionScopeStatus),
    quotaStatus: defaultStatus(input.quotaStatus),
    requiredAction: input.requiredAction ?? getFirstRequiredAction(diagnostics),
    state,
    tokenFreshness: defaultStatus(input.tokenFreshness),
  };
}
