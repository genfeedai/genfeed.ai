import { describe, expect, it } from 'vitest';
import { resolvePermissionScopeReadiness } from './permission-scope-readiness.helper';

const CHECKED_AT = '2026-08-14T00:00:00.000Z';

describe('resolvePermissionScopeReadiness', () => {
  it('stays unknown when granted scopes were never captured', () => {
    expect(
      resolvePermissionScopeReadiness({
        checkedAt: CHECKED_AT,
        grantedScopes: [],
        hasCapturedGrantedScopes: false,
        requiredScopes: ['tweet.write'],
      }),
    ).toEqual({ diagnostics: [], status: 'unknown' });
  });

  it('stays unknown when the platform does not declare required publish scopes', () => {
    expect(
      resolvePermissionScopeReadiness({
        checkedAt: CHECKED_AT,
        grantedScopes: ['identity'],
        hasCapturedGrantedScopes: true,
        requiredScopes: undefined,
      }),
    ).toEqual({ diagnostics: [], status: 'unknown' });
  });

  it('passes when every required publish scope is present', () => {
    expect(
      resolvePermissionScopeReadiness({
        checkedAt: CHECKED_AT,
        grantedScopes: ['tweet.read', 'tweet.write', 'users.read'],
        hasCapturedGrantedScopes: true,
        requiredScopes: ['tweet.write'],
      }),
    ).toEqual({ diagnostics: [], status: 'pass' });
  });

  it('fails with a reconnect diagnostic when a required scope is missing', () => {
    const result = resolvePermissionScopeReadiness({
      checkedAt: CHECKED_AT,
      grantedScopes: ['tweet.read', 'users.read'],
      hasCapturedGrantedScopes: true,
      requiredScopes: ['tweet.write'],
    });

    expect(result.status).toBe('fail');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        checkedAt: CHECKED_AT,
        classification: 'missing_permission_scope',
        code: 'credential_missing_permission_scope',
        correctiveAction:
          'Reconnect the provider account and grant the missing publishing permissions.',
        details: {
          grantedScopes: ['tweet.read', 'users.read'],
          missingScopes: ['tweet.write'],
          requiredScopes: ['tweet.write'],
        },
        isRetryable: true,
        message:
          'This account is missing required publishing permissions: tweet.write.',
        scope: 'permission',
        severity: 'error',
      }),
    ]);
  });

  it('fails after a refresh that lost a previously granted required scope', () => {
    const result = resolvePermissionScopeReadiness({
      checkedAt: CHECKED_AT,
      grantedScopes: ['tweet.read'],
      hasCapturedGrantedScopes: true,
      requiredScopes: ['tweet.write'],
    });

    expect(result.status).toBe('fail');
    expect(result.diagnostics[0]?.details).toMatchObject({
      missingScopes: ['tweet.write'],
    });
  });
});
