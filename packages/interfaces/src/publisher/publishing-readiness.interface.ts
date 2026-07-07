import type { CredentialPlatform } from '@genfeedai/enums';

export type PublishingReadinessState =
  | 'publish_capable'
  | 'degraded'
  | 'blocked'
  | 'unknown';

export type PublishingSetupFailureClassification =
  | 'misconfiguration'
  | 'missing_provider_approval'
  | 'expired_credential'
  | 'missing_permission_scope'
  | 'provider_outage'
  | 'quota_or_rate_limit'
  | 'unsupported_self_host_mode'
  | 'unknown';

export type PublishingDiagnosticSeverity = 'info' | 'warning' | 'error';

export type PublishingSetupCheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export type PublishingSetupCheckScope =
  | 'core_runtime'
  | 'auth'
  | 'provider'
  | 'callback'
  | 'credential'
  | 'permission'
  | 'app_review'
  | 'quota';

export interface IPublishingDiagnostic {
  /** Stable machine-readable code for API/MCP/CLI consumers. */
  code: string;
  /** Safe user-facing summary of the failed or degraded check. */
  message: string;
  classification: PublishingSetupFailureClassification;
  severity: PublishingDiagnosticSeverity;
  /** Whether retrying the provider/setup validation could recover this state. */
  isRetryable: boolean;
  scope?: PublishingSetupCheckScope;
  /** Specific next action a self-host operator or channel owner can take. */
  correctiveAction?: string;
  /** ISO 8601 timestamp for the diagnostic observation. */
  checkedAt?: string;
  /** Non-secret provider/setup evidence. Values must be redacted before export. */
  details?: Record<string, unknown>;
}

export interface IPublishingSetupCheck {
  key: string;
  label: string;
  status: PublishingSetupCheckStatus;
  scope: PublishingSetupCheckScope;
  diagnostics: IPublishingDiagnostic[];
}

export interface IPublishingSetupChecklist {
  state: PublishingReadinessState;
  generatedAt: string;
  checks: IPublishingSetupCheck[];
}

export interface IPublishingProviderReadiness {
  providerKey: CredentialPlatform | string;
  credentialId?: string | null;
  state: PublishingReadinessState;
  /** False only for states that must block schedule mutation before queueing. */
  canSchedule: boolean;
  /** Whether a later validation attempt can reasonably recover the state. */
  isRetryable: boolean;
  requiredAction?: string | null;
  callbackUrlStatus: PublishingSetupCheckStatus;
  permissionScopeStatus: PublishingSetupCheckStatus;
  tokenFreshness: PublishingSetupCheckStatus;
  appReviewStatus: PublishingSetupCheckStatus;
  quotaStatus: PublishingSetupCheckStatus;
  lastValidationAttemptAt?: string | null;
  lastSuccessfulValidationAt?: string | null;
  diagnostics: IPublishingDiagnostic[];
}
