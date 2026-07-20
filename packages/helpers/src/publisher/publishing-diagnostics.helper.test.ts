import type { IPublishingDiagnostic } from '@genfeedai/interfaces';
import {
  buildPublishingProviderReadiness,
  canScheduleWithPublishingReadiness,
  classifyPublishingDiagnostic,
  classifyPublishingReadiness,
  redactPublishingDiagnosticValue,
  sanitizePublishingDiagnostic,
} from '@helpers/publisher/publishing-diagnostics.helper';

function diagnostic(
  overrides: Partial<IPublishingDiagnostic> = {},
): IPublishingDiagnostic {
  return {
    classification: 'unknown',
    code: 'provider_unknown',
    isRetryable: true,
    message: 'Provider returned an unknown response.',
    severity: 'warning',
    ...overrides,
  };
}

describe('publishing diagnostics helpers', () => {
  it('classifies common provider setup failures into stable buckets', () => {
    expect(
      classifyPublishingDiagnostic({
        code: 'redirect_uri_mismatch',
        message: 'OAuth redirect URI is not allowed',
      }),
    ).toBe('misconfiguration');

    expect(
      classifyPublishingDiagnostic({
        message: 'App review required before publishing',
      }),
    ).toBe('missing_provider_approval');

    expect(
      classifyPublishingDiagnostic({
        message: 'Missing instagram_content_publish scope',
      }),
    ).toBe('missing_permission_scope');

    expect(
      classifyPublishingDiagnostic({
        statusCode: 401,
      }),
    ).toBe('expired_credential');

    expect(
      classifyPublishingDiagnostic({
        message: 'Provider quota exceeded',
      }),
    ).toBe('quota_or_rate_limit');

    expect(
      classifyPublishingDiagnostic({
        statusCode: 503,
      }),
    ).toBe('provider_outage');

    expect(
      classifyPublishingDiagnostic({
        message: 'Managed provider keys are not available in self-host mode',
      }),
    ).toBe('unsupported_self_host_mode');
  });

  it('redacts nested secrets without removing non-secret evidence', () => {
    const redacted = redactPublishingDiagnosticValue({
      callbackUrl:
        'https://example.com/oauth/callback?code=visible&access_token=secret-token',
      headers: {
        Authorization: 'Bearer abc.def.ghi',
        requestId: 'req_123',
      },
      nested: [
        {
          clientSecret: 'client-secret',
          providerStatus: 'pending_review',
        },
      ],
    });

    expect(redacted).toEqual({
      callbackUrl:
        'https://example.com/oauth/callback?code=visible&access_token=[REDACTED]',
      headers: {
        Authorization: '[REDACTED]',
        requestId: 'req_123',
      },
      nested: [
        {
          clientSecret: '[REDACTED]',
          providerStatus: 'pending_review',
        },
      ],
    });
  });

  it('sanitizes diagnostic detail before export', () => {
    const sanitized = sanitizePublishingDiagnostic(
      diagnostic({
        details: {
          apiKey: 'sk-test-secret',
          errorCode: 'redirect_uri_mismatch',
        },
      }),
    );

    expect(sanitized.details).toEqual({
      apiKey: '[REDACTED]',
      errorCode: 'redirect_uri_mismatch',
    });
  });

  it('marks non-retryable setup errors as blocked for scheduling', () => {
    const state = classifyPublishingReadiness([
      diagnostic({
        classification: 'missing_permission_scope',
        isRetryable: false,
        severity: 'error',
      }),
    ]);

    expect(state).toBe('blocked');
    expect(canScheduleWithPublishingReadiness(state)).toBe(false);
  });

  it('keeps retryable provider errors degraded instead of blocked', () => {
    const state = classifyPublishingReadiness([
      diagnostic({
        classification: 'provider_outage',
        isRetryable: true,
        severity: 'error',
      }),
    ]);

    expect(state).toBe('degraded');
    expect(canScheduleWithPublishingReadiness(state)).toBe(true);
  });

  it('builds sanitized provider readiness with inferred schedule gate', () => {
    const readiness = buildPublishingProviderReadiness({
      appReviewStatus: 'fail',
      callbackUrlStatus: 'pass',
      diagnostics: [
        diagnostic({
          classification: 'missing_provider_approval',
          correctiveAction: 'Move the Meta app out of development mode.',
          details: {
            accessToken: 'secret-token',
            appMode: 'development',
          },
          isRetryable: false,
          severity: 'error',
        }),
      ],
      permissionScopeStatus: 'pass',
      providerKey: 'instagram',
      quotaStatus: 'unknown',
      tokenFreshness: 'pass',
    });

    expect(readiness.state).toBe('blocked');
    expect(readiness.canSchedule).toBe(false);
    expect(readiness.isRetryable).toBe(false);
    expect(readiness.requiredAction).toBe(
      'Move the Meta app out of development mode.',
    );
    expect(readiness.diagnostics[0]?.details).toEqual({
      accessToken: '[REDACTED]',
      appMode: 'development',
    });
  });
});
