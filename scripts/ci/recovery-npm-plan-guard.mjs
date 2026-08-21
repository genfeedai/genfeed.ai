#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function fail(message) {
  throw new Error(message);
}

export function validateRecoveryNpmPlan({
  hasPackages,
  recoveryRunId,
  validatedHistoricalRecovery,
}) {
  if (validatedHistoricalRecovery !== 'true') {
    fail('The npm no-op guard requires a validated historical recovery.');
  }
  if (!/^[1-9][0-9]*$/.test(recoveryRunId ?? '')) {
    fail('Historical npm recovery requires a positive recovery run ID.');
  }
  if (hasPackages !== 'true' && hasPackages !== 'false') {
    fail('Recovery npm plan has_packages must be exactly true or false.');
  }
  if (hasPackages === 'true') {
    fail(
      'Historical release recovery cannot publish pending npm packages. Cut a new release from current master so npm provenance remains truthful.',
    );
  }

  return {
    hasPackages: false,
    recoveryRunId,
  };
}

export function runRecoveryNpmPlanGuard({
  env = process.env,
  write = console.log,
} = {}) {
  const result = validateRecoveryNpmPlan({
    hasPackages: env.HAS_PACKAGES,
    recoveryRunId: env.RECOVERY_RUN_ID,
    validatedHistoricalRecovery: env.VALIDATED_HISTORICAL_RECOVERY,
  });
  write(
    `Historical recovery ${result.recoveryRunId} has an empty npm plan; no registry publication will run.`,
  );
  return result;
}

const isDirectInvocation =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectInvocation) {
  try {
    runRecoveryNpmPlanGuard();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
