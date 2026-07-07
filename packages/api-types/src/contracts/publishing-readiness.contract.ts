/**
 * Publishing setup/readiness API contract.
 *
 * Shared observable states for self-host scheduler setup, provider credential
 * readiness, sanitized diagnostics, and schedule-blocking decisions. This is
 * intentionally provider-agnostic; individual integrations can add evidence in
 * `details`, but exports must redact secrets before exposing diagnostics.
 *
 * Foundation for issue #1144.
 */

import { CredentialPlatform } from '@genfeedai/enums';
import { z } from 'zod';

export const publishingReadinessStateValues = [
  'publish_capable',
  'degraded',
  'blocked',
  'unknown',
] as const;

export const publishingSetupFailureClassificationValues = [
  'misconfiguration',
  'missing_provider_approval',
  'expired_credential',
  'missing_permission_scope',
  'provider_outage',
  'quota_or_rate_limit',
  'unsupported_self_host_mode',
  'unknown',
] as const;

export const publishingDiagnosticSeverityValues = [
  'info',
  'warning',
  'error',
] as const;

export const publishingSetupCheckStatusValues = [
  'pass',
  'warn',
  'fail',
  'unknown',
] as const;

export const publishingSetupCheckScopeValues = [
  'core_runtime',
  'auth',
  'provider',
  'callback',
  'credential',
  'permission',
  'app_review',
  'quota',
] as const;

export const publishingReadinessStateSchema = z.enum(
  publishingReadinessStateValues,
);
export const publishingSetupFailureClassificationSchema = z.enum(
  publishingSetupFailureClassificationValues,
);
export const publishingDiagnosticSeveritySchema = z.enum(
  publishingDiagnosticSeverityValues,
);
export const publishingSetupCheckStatusSchema = z.enum(
  publishingSetupCheckStatusValues,
);
export const publishingSetupCheckScopeSchema = z.enum(
  publishingSetupCheckScopeValues,
);

export const publishingDiagnosticSchema = z.object({
  checkedAt: z.string().datetime().optional(),
  classification: publishingSetupFailureClassificationSchema,
  code: z.string().min(1),
  correctiveAction: z.string().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  isRetryable: z.boolean(),
  message: z.string().min(1),
  scope: publishingSetupCheckScopeSchema.optional(),
  severity: publishingDiagnosticSeveritySchema,
});

export const publishingSetupCheckSchema = z.object({
  diagnostics: z.array(publishingDiagnosticSchema),
  key: z.string().min(1),
  label: z.string().min(1),
  scope: publishingSetupCheckScopeSchema,
  status: publishingSetupCheckStatusSchema,
});

export const publishingSetupChecklistSchema = z.object({
  checks: z.array(publishingSetupCheckSchema),
  generatedAt: z.string().datetime(),
  state: publishingReadinessStateSchema,
});

export const publishingProviderReadinessSchema = z.object({
  appReviewStatus: publishingSetupCheckStatusSchema,
  callbackUrlStatus: publishingSetupCheckStatusSchema,
  canSchedule: z.boolean(),
  credentialId: z.string().min(1).nullable().optional(),
  diagnostics: z.array(publishingDiagnosticSchema),
  isRetryable: z.boolean(),
  lastSuccessfulValidationAt: z.string().datetime().nullable().optional(),
  lastValidationAttemptAt: z.string().datetime().nullable().optional(),
  permissionScopeStatus: publishingSetupCheckStatusSchema,
  providerKey: z.union([z.nativeEnum(CredentialPlatform), z.string().min(1)]),
  quotaStatus: publishingSetupCheckStatusSchema,
  requiredAction: z.string().min(1).nullable().optional(),
  state: publishingReadinessStateSchema,
  tokenFreshness: publishingSetupCheckStatusSchema,
});

export type PublishingReadinessState = z.infer<
  typeof publishingReadinessStateSchema
>;
export type PublishingSetupFailureClassification = z.infer<
  typeof publishingSetupFailureClassificationSchema
>;
export type PublishingDiagnosticSeverity = z.infer<
  typeof publishingDiagnosticSeveritySchema
>;
export type PublishingSetupCheckStatus = z.infer<
  typeof publishingSetupCheckStatusSchema
>;
export type PublishingSetupCheckScope = z.infer<
  typeof publishingSetupCheckScopeSchema
>;
export type PublishingDiagnostic = z.infer<typeof publishingDiagnosticSchema>;
export type PublishingSetupCheck = z.infer<typeof publishingSetupCheckSchema>;
export type PublishingSetupChecklist = z.infer<
  typeof publishingSetupChecklistSchema
>;
export type PublishingProviderReadiness = z.infer<
  typeof publishingProviderReadinessSchema
>;
