import type {
  IPublishingDiagnostic,
  PermissionScopeReadinessInput,
  PermissionScopeReadinessResult,
} from '@genfeedai/contracts/interfaces';

function missingRequiredScopes(
  grantedScopes: readonly string[],
  requiredScopes: readonly string[],
): string[] {
  const granted = new Set(grantedScopes);
  return requiredScopes.filter((scope) => !granted.has(scope));
}

function buildMissingPermissionScopeDiagnostic(
  input: PermissionScopeReadinessInput,
  missingScopes: readonly string[],
  requiredScopes: readonly string[],
): IPublishingDiagnostic {
  return {
    checkedAt: input.checkedAt,
    classification: 'missing_permission_scope',
    code: 'credential_missing_permission_scope',
    correctiveAction:
      'Reconnect the provider account and grant the missing publishing permissions.',
    details: {
      grantedScopes: [...input.grantedScopes],
      missingScopes: [...missingScopes],
      requiredScopes: [...requiredScopes],
    },
    isRetryable: true,
    message: `This account is missing required publishing permissions: ${missingScopes.join(', ')}.`,
    scope: 'permission',
    severity: 'error',
  };
}

/**
 * Derives the publishing-readiness permission axis from a persisted grant.
 *
 * Never captured, and platforms that do not declare required publish scopes,
 * stay `unknown` rather than guessing `pass`.
 */
export function resolvePermissionScopeReadiness(
  input: PermissionScopeReadinessInput,
): PermissionScopeReadinessResult {
  if (!input.hasCapturedGrantedScopes) {
    return { diagnostics: [], status: 'unknown' };
  }

  const requiredScopes = input.requiredScopes;
  if (!requiredScopes || requiredScopes.length === 0) {
    return { diagnostics: [], status: 'unknown' };
  }

  const missingScopes = missingRequiredScopes(
    input.grantedScopes,
    requiredScopes,
  );
  if (missingScopes.length === 0) {
    return { diagnostics: [], status: 'pass' };
  }

  return {
    diagnostics: [
      buildMissingPermissionScopeDiagnostic(
        input,
        missingScopes,
        requiredScopes,
      ),
    ],
    status: 'fail',
  };
}
