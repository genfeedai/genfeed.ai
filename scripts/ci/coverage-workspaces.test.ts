import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COVERAGE_ROOT_SCRIPTS,
  COVERAGE_WORKSPACE_EXCLUSIONS,
  COVERAGE_WORKSPACES,
  type CoverageWorkspaceExclusion,
} from './coverage-workspaces.manifest';

type PackageManifest = {
  scripts?: Record<string, unknown>;
};

const testDirectories: string[] = [];

afterEach(() => {
  for (const testDirectory of testDirectories.splice(0)) {
    rmSync(testDirectory, { force: true, recursive: true });
  }
});

describe('coverage workspaces', () => {
  it('keeps the workflow workspace inventory synchronized with the manifest', () => {
    const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
    const workflow = readFileSync(
      path.join(repositoryRoot, '.github/workflows/coverage.yml'),
      'utf8',
    );
    const workflowWorkspaces = [
      ...new Set(
        workflow.match(
          /\b(?:apps\/(?:app|server\/api)|packages\/[a-z0-9-]+)\b/g,
        ) ?? [],
      ),
    ].sort();

    expect(workflowWorkspaces).toEqual([...COVERAGE_WORKSPACES].sort());
    for (const [, days] of workflow.matchAll(/retention-days: (\d+)/g)) {
      expect(Number(days)).toBe(7);
    }
    expect(workflow).toMatch(/E2E_COVERAGE_THRESHOLD: "0"/);
    expect(
      validateCoverageWorkspaceScripts(
        repositoryRoot,
        COVERAGE_WORKSPACES,
        COVERAGE_WORKSPACE_EXCLUSIONS,
      ),
    ).toEqual([]);
    expect(validateRootScripts(repositoryRoot, COVERAGE_ROOT_SCRIPTS)).toEqual(
      [],
    );
  });

  it('fails when an included workspace loses its test script', () => {
    const rootDir = createFixture();
    writeManifest(rootDir, 'package.json', {
      scripts: { 'test:e2e:coverage': 'playwright test' },
    });
    writeManifest(rootDir, 'packages/contracts/src/enums/package.json', {
      scripts: {},
    });

    expect(
      validateCoverageWorkspaceScripts(
        rootDir,
        ['packages/contracts/src/enums'],
        [],
      ),
    ).toEqual([
      'packages/contracts/src/enums/package.json must declare a non-empty scripts.test command that does not suppress failures.',
    ]);
  });

  it('accepts an Istanbul coverage-final.json when lcov.info is missing', () => {
    const rootDir = createFixture();
    const coverageDir = path.join(rootDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(path.join(coverageDir, 'coverage-final.json'), '{}\n');

    const script = path.join(
      fileURLToPath(new URL('../..', import.meta.url)),
      'scripts/ci/assert-coverage-report.sh',
    );
    const result = spawnSync('bash', [script, coverageDir], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('coverage-final.json');
  });

  it('fails when neither lcov.info nor coverage-final.json exists', () => {
    const rootDir = createFixture();
    const coverageDir = path.join(rootDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });

    const script = path.join(
      fileURLToPath(new URL('../..', import.meta.url)),
      'scripts/ci/assert-coverage-report.sh',
    );
    const result = spawnSync('bash', [script, coverageDir], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toMatch(
      /lcov\.info or coverage-final\.json/u,
    );
  });

  it('requires explicit exclusions to be reasoned and issue-tracked', () => {
    const rootDir = createFixture();
    writeManifest(rootDir, 'packages/contracts/src/enums/package.json', {
      scripts: {},
    });

    expect(
      validateCoverageWorkspaceScripts(
        rootDir,
        ['packages/contracts/src/enums'],
        [
          {
            path: 'packages/contracts/src/enums',
            reason: ' ',
            trackingIssue: 0,
          },
        ],
      ),
    ).toEqual([
      'packages/contracts/src/enums coverage exclusion must have a reason and positive tracking issue.',
    ]);
  });
});

function createFixture(): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'coverage-workspaces-'));
  testDirectories.push(rootDir);
  return rootDir;
}

function readManifest(rootDir: string, relativePath: string): PackageManifest {
  return JSON.parse(
    readFileSync(path.join(rootDir, relativePath), 'utf8'),
  ) as PackageManifest;
}

function validateCoverageWorkspaceScripts(
  rootDir: string,
  workspaces: readonly string[],
  exclusions: readonly CoverageWorkspaceExclusion[],
): string[] {
  const violations: string[] = [];
  const exclusionsByPath = new Map(
    exclusions.map((exclusion) => [exclusion.path, exclusion]),
  );

  for (const workspace of workspaces) {
    const exclusion = exclusionsByPath.get(workspace);
    if (exclusion) {
      if (
        exclusion.reason.trim().length < 10 ||
        !Number.isInteger(exclusion.trackingIssue) ||
        exclusion.trackingIssue <= 0
      ) {
        violations.push(
          `${workspace} coverage exclusion must have a reason and positive tracking issue.`,
        );
      }
      continue;
    }

    const manifest = readManifest(rootDir, `${workspace}/package.json`);
    const testScript = manifest.scripts?.test;
    if (!isRunnableTestCommand(testScript)) {
      violations.push(
        `${workspace}/package.json must declare a non-empty scripts.test command that does not suppress failures.`,
      );
    }
  }

  for (const exclusion of exclusions) {
    if (!workspaces.includes(exclusion.path)) {
      violations.push(
        `${exclusion.path} coverage exclusion does not match an included workspace.`,
      );
    }
  }

  return violations;
}

function validateRootScripts(
  rootDir: string,
  scriptNames: readonly string[],
): string[] {
  const manifest = readManifest(rootDir, 'package.json');

  return scriptNames.flatMap((scriptName) => {
    const script = manifest.scripts?.[scriptName];
    return isRunnableTestCommand(script)
      ? []
      : [
          `package.json must declare a non-empty scripts.${scriptName} command that does not suppress failures.`,
        ];
  });
}

function isRunnableTestCommand(command: unknown): command is string {
  return (
    typeof command === 'string' &&
    command.trim().length > 0 &&
    !/\|\|\s*(?:exit\s+0|true)\b/.test(command)
  );
}

function writeManifest(
  rootDir: string,
  relativePath: string,
  manifest: PackageManifest,
): void {
  const manifestPath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
