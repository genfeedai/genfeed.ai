import type {
  IPublishingDiagnostic,
  IPublishingProviderReadiness,
  PublishingReadinessState,
  PublishingSetupCheckStatus,
  PublishingSetupFailureClassification,
} from '@genfeedai/interfaces';

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

export interface CredentialTokenPublishingReadinessInput {
  accessTokenExpiresAt?: Date | string | null;
  credentialId: string;
  hasAccessCredential: boolean;
  hasRefreshToken: boolean;
  isConnected: boolean;
  now?: Date;
  providerKey: IPublishingProviderReadiness['providerKey'];
  refreshTokenExpiresAt?: Date | string | null;
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

export function classifyPublishingDiagnostic(
  input: PublishingDiagnosticClassificationInput,
): PublishingSetupFailureClassification {
  const haystack = [input.code, input.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  if (
    /\b(self[-_ ]?host|hosted[-_ ]?key|managed[-_ ]?provider)\b/.test(haystack)
  ) {
    return 'unsupported_self_host_mode';
  }

  if (
    /\b(app[-_ ]?review|approval|not[-_ ]?approved|developer[-_ ]?mode)\b/.test(
      haystack,
    )
  ) {
    return 'missing_provider_approval';
  }

  if (
    /\b(scope|permission|permissions|insufficient[_-]?scope|forbidden)\b/.test(
      haystack,
    ) ||
    input.statusCode === 403
  ) {
    return 'missing_permission_scope';
  }

  if (
    /\b(expired|invalid[_-]?token|refresh[_-]?token|revoked|reauth)\b/.test(
      haystack,
    ) ||
    input.statusCode === 401
  ) {
    return 'expired_credential';
  }

  if (/\b(rate[-_ ]?limit|quota|too many requests)\b/.test(haystack)) {
    return 'quota_or_rate_limit';
  }

  if (
    /\b(timeout|unavailable|outage|econnreset|econnrefused|5\d\d)\b/.test(
      haystack,
    ) ||
    (typeof input.statusCode === 'number' && input.statusCode >= 500)
  ) {
    return 'provider_outage';
  }

  if (
    /\b(callback|redirect[_-]?uri|redirect uri|webhook|public url|env|missing config|missing secret)\b/.test(
      haystack,
    )
  ) {
    return 'misconfiguration';
  }

  return 'unknown';
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

function readExpiryTimestamp(
  value: Date | string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function buildCredentialTokenPublishingReadiness(
  input: CredentialTokenPublishingReadinessInput,
): IPublishingProviderReadiness {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const accessTokenExpiry = readExpiryTimestamp(input.accessTokenExpiresAt);
  const refreshTokenExpiry = readExpiryTimestamp(input.refreshTokenExpiresAt);

  if (!input.isConnected) {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      diagnostics: [
        {
          checkedAt,
          classification: 'expired_credential',
          code: 'credential_disconnected',
          correctiveAction: 'Reconnect the provider account before publishing.',
          isRetryable: true,
          message: 'The provider account is disconnected.',
          scope: 'credential',
          severity: 'error',
        },
      ],
      lastValidationAttemptAt: checkedAt,
      providerKey: input.providerKey,
      tokenFreshness: 'fail',
    });
  }

  if (!input.hasAccessCredential) {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      diagnostics: [
        {
          checkedAt,
          classification: 'expired_credential',
          code: 'credential_access_token_missing',
          correctiveAction: 'Reconnect the provider account before publishing.',
          isRetryable: true,
          message: 'The provider account has no usable access credential.',
          scope: 'credential',
          severity: 'error',
        },
      ],
      lastValidationAttemptAt: checkedAt,
      providerKey: input.providerKey,
      tokenFreshness: 'fail',
    });
  }

  if (accessTokenExpiry === null) {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      lastValidationAttemptAt: checkedAt,
      providerKey: input.providerKey,
      tokenFreshness: 'unknown',
    });
  }

  if (accessTokenExpiry > now.getTime()) {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      lastSuccessfulValidationAt: checkedAt,
      lastValidationAttemptAt: checkedAt,
      providerKey: input.providerKey,
      tokenFreshness: 'pass',
    });
  }

  const hasUsableRefreshToken =
    input.hasRefreshToken &&
    (refreshTokenExpiry === null || refreshTokenExpiry > now.getTime());

  if (hasUsableRefreshToken) {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      diagnostics: [
        {
          checkedAt,
          classification: 'expired_credential',
          code: 'credential_access_token_refresh_required',
          correctiveAction:
            'Refresh the provider credential before the next publish attempt.',
          isRetryable: true,
          message:
            'The access token is expired, but a refresh credential is available.',
          scope: 'credential',
          severity: 'warning',
        },
      ],
      lastValidationAttemptAt: checkedAt,
      providerKey: input.providerKey,
      tokenFreshness: 'warn',
    });
  }

  return buildPublishingProviderReadiness({
    credentialId: input.credentialId,
    diagnostics: [
      {
        checkedAt,
        classification: 'expired_credential',
        code: 'credential_reconnect_required',
        correctiveAction: 'Reconnect the provider account before publishing.',
        isRetryable: true,
        message:
          'The provider credential is expired and cannot be refreshed safely.',
        scope: 'credential',
        severity: 'error',
      },
    ],
    lastValidationAttemptAt: checkedAt,
    providerKey: input.providerKey,
    tokenFreshness: 'fail',
  });
}
