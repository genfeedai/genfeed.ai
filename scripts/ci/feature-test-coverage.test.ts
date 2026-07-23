import { describe, expect, it } from 'vitest';
import {
  evaluateFeatureTestCoverage,
  formatFeatureTestCoverage,
  isProductionSourceFile,
  isTestFile,
  parseChangedFiles,
} from './feature-test-coverage';

describe('feature test coverage', () => {
  it('requires test changes for feature production code', () => {
    const result = evaluateFeatureTestCoverage('feat(api): add scheduling', [
      { path: 'apps/server/api/src/scheduler.service.ts', status: 'M' },
    ]);

    expect(result.passed).toBe(false);
    expect(result.productionFiles).toEqual([
      'apps/server/api/src/scheduler.service.ts',
    ]);
    expect(formatFeatureTestCoverage(result)).toContain(
      'Production files requiring coverage',
    );
  });

  it.each([
    'feat',
    'fix(auth)',
    'refactor!',
  ])('accepts %s changes when a test is added', (prefix) => {
    const result = evaluateFeatureTestCoverage(`${prefix}: covered change`, [
      { path: 'packages/auth-client/src/session.ts', status: 'M' },
      { path: 'packages/auth-client/src/session.test.ts', status: 'A' },
    ]);

    expect(result.passed).toBe(true);
    expect(result.testFiles).toEqual([
      'packages/auth-client/src/session.test.ts',
    ]);
  });

  it('does not count a deleted test as new coverage evidence', () => {
    const result = evaluateFeatureTestCoverage('fix: preserve behavior', [
      { path: 'packages/helpers/src/contract.ts', status: 'M' },
      { path: 'packages/helpers/src/contract.test.ts', status: 'D' },
    ]);

    expect(result.passed).toBe(false);
    expect(result.testFiles).toEqual([]);
  });

  it('keeps non-runtime maintenance PRs outside the enforcement boundary', () => {
    const result = evaluateFeatureTestCoverage(
      'chore(deps): refresh lockfile',
      [{ path: 'packages/helpers/src/contract.ts', status: 'M' }],
    );

    expect(result).toMatchObject({ applicable: false, passed: true });
  });

  it('recognizes unit, integration, E2E, and Node test paths', () => {
    expect(isTestFile('apps/app/src/page.test.tsx')).toBe(true);
    expect(isTestFile('apps/server/api/test/integration/auth.spec.ts')).toBe(
      true,
    );
    expect(isTestFile('playwright/e2e/tests/auth/login.spec.ts')).toBe(true);
    expect(isTestFile('scripts/ci/tests-gate.test.mjs')).toBe(true);
  });

  it('limits production classification to authored runtime source', () => {
    expect(isProductionSourceFile('apps/app/src/page.tsx')).toBe(true);
    expect(isProductionSourceFile('packages/ui/src/button.tsx')).toBe(true);
    expect(isProductionSourceFile('scripts/ci/collector.ts')).toBe(true);
    expect(isProductionSourceFile('apps/app/src/page.test.tsx')).toBe(false);
    expect(isProductionSourceFile('apps/app/next.config.ts')).toBe(false);
    expect(isProductionSourceFile('docs/testing.md')).toBe(false);
  });

  it('parses modified and renamed files from git name-status output', () => {
    expect(
      parseChangedFiles(
        'M\tapps/app/src/page.tsx\nR100\told.test.ts\tapps/app/src/page.test.tsx\n',
      ),
    ).toEqual([
      { path: 'apps/app/src/page.tsx', status: 'M' },
      { path: 'apps/app/src/page.test.tsx', status: 'R100' },
    ]);
  });
});
