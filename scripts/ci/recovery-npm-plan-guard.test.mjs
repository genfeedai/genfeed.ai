import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runRecoveryNpmPlanGuard,
  validateRecoveryNpmPlan,
} from './recovery-npm-plan-guard.mjs';

const V66_FAILED_RUN_ID = '32272857631';

test('allows the verified v66 recovery to continue when the npm plan is empty', () => {
  assert.deepEqual(
    validateRecoveryNpmPlan({
      hasPackages: 'false',
      recoveryRunId: V66_FAILED_RUN_ID,
      validatedHistoricalRecovery: 'true',
    }),
    {
      hasPackages: false,
      recoveryRunId: V66_FAILED_RUN_ID,
    },
  );
});

test('blocks historical recovery when any npm package would be published', () => {
  assert.throws(
    () =>
      validateRecoveryNpmPlan({
        hasPackages: 'true',
        recoveryRunId: V66_FAILED_RUN_ID,
        validatedHistoricalRecovery: 'true',
      }),
    /cannot publish pending npm packages.*new release from current master/i,
  );
});

test('fails closed for invalid or incomplete recovery evidence', () => {
  const valid = {
    hasPackages: 'false',
    recoveryRunId: V66_FAILED_RUN_ID,
    validatedHistoricalRecovery: 'true',
  };

  assert.throws(
    () =>
      validateRecoveryNpmPlan({
        ...valid,
        validatedHistoricalRecovery: 'false',
      }),
    /validated historical recovery/i,
  );
  assert.throws(
    () => validateRecoveryNpmPlan({ ...valid, recoveryRunId: '' }),
    /positive recovery run ID/i,
  );
  assert.throws(
    () => validateRecoveryNpmPlan({ ...valid, hasPackages: 'unknown' }),
    /has_packages must be exactly true or false/i,
  );
});

test('CLI contract reports a no-op without exposing a publication path', () => {
  const output = [];
  const result = runRecoveryNpmPlanGuard({
    env: {
      HAS_PACKAGES: 'false',
      RECOVERY_RUN_ID: V66_FAILED_RUN_ID,
      VALIDATED_HISTORICAL_RECOVERY: 'true',
    },
    write: (message) => output.push(message),
  });

  assert.equal(result.hasPackages, false);
  assert.deepEqual(output, [
    `Historical recovery ${V66_FAILED_RUN_ID} has an empty npm plan; no registry publication will run.`,
  ]);
});
