import {
  publishingDiagnosticSchema,
  publishingProviderReadinessSchema,
  publishingSetupChecklistSchema,
} from '@api-types/contracts/publishing-readiness.contract';
import { CredentialPlatform } from '@genfeedai/enums';
import { describe, expect, test } from 'vitest';

describe('publishing readiness contract', () => {
  test('accepts a blocked provider readiness payload with actionable diagnostics', () => {
    const readiness = publishingProviderReadinessSchema.parse({
      appReviewStatus: 'fail',
      callbackUrlStatus: 'pass',
      canSchedule: false,
      credentialId: 'cred_123',
      diagnostics: [
        {
          checkedAt: '2026-07-03T10:00:00.000Z',
          classification: 'missing_provider_approval',
          code: 'meta_app_review_required',
          correctiveAction: 'Move the Meta app out of development mode.',
          isRetryable: false,
          message: 'Meta app review is required before publishing.',
          scope: 'app_review',
          severity: 'error',
        },
      ],
      isRetryable: false,
      lastSuccessfulValidationAt: null,
      lastValidationAttemptAt: '2026-07-03T10:00:00.000Z',
      permissionScopeStatus: 'pass',
      providerKey: CredentialPlatform.INSTAGRAM,
      quotaStatus: 'unknown',
      requiredAction: 'Move the Meta app out of development mode.',
      state: 'blocked',
      tokenFreshness: 'pass',
    });

    expect(readiness.state).toBe('blocked');
    expect(readiness.canSchedule).toBe(false);
    expect(readiness.diagnostics[0]?.classification).toBe(
      'missing_provider_approval',
    );
  });

  test('keeps diagnostic details as bounded non-secret evidence', () => {
    const diagnostic = publishingDiagnosticSchema.parse({
      classification: 'misconfiguration',
      code: 'oauth_redirect_uri_mismatch',
      correctiveAction:
        'Add https://app.example.com/integrations/instagram/callback to the provider app.',
      details: {
        callbackUrl: 'https://app.example.com/integrations/instagram/callback',
        providerErrorCode: 'redirect_uri_mismatch',
      },
      isRetryable: false,
      message: 'OAuth callback URL is not registered in the provider app.',
      scope: 'callback',
      severity: 'error',
    });

    expect(diagnostic.details).toEqual({
      callbackUrl: 'https://app.example.com/integrations/instagram/callback',
      providerErrorCode: 'redirect_uri_mismatch',
    });
  });

  test('accepts a self-host setup checklist for core runtime checks', () => {
    const checklist = publishingSetupChecklistSchema.parse({
      checks: [
        {
          diagnostics: [],
          key: 'redis.reachability',
          label: 'Redis reachability',
          scope: 'core_runtime',
          status: 'pass',
        },
        {
          diagnostics: [
            {
              classification: 'misconfiguration',
              code: 'public_url_missing',
              correctiveAction:
                'Set the public application URL used by OAuth callbacks.',
              isRetryable: false,
              message: 'Public URL is required for provider callbacks.',
              scope: 'callback',
              severity: 'error',
            },
          ],
          key: 'public_url',
          label: 'Public callback URL',
          scope: 'callback',
          status: 'fail',
        },
      ],
      generatedAt: '2026-07-03T10:00:00.000Z',
      state: 'blocked',
    });

    expect(checklist.checks).toHaveLength(2);
    expect(checklist.state).toBe('blocked');
  });
});
