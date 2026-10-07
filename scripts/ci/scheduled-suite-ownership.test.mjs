import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WORKFLOWS_DIRECTORY = path.join(
  fileURLToPath(new URL('../..', import.meta.url)),
  '.github',
  'workflows',
);

// Every scheduled suite family has exactly one scheduled owner: the workflow
// file plus a job it must still define. Adding a scheduled workflow requires
// adding its family here, and removing an owner job fails the test.
const SUITE_FAMILY_OWNERS = {
  'cla-status-recovery': {
    workflow: 'cla-status-recovery.yml',
    job: 'recover',
  },
  'api-e2e-full': { workflow: 'e2e.yml', job: 'e2e-api-full' },
  'frontend-e2e-authed': { workflow: 'e2e.yml', job: 'e2e-frontend-authed' },
  'frontend-playwright-full': {
    workflow: 'playwright-full-nightly.yml',
    job: 'e2e-frontend-full',
  },
  'learning-runtime': {
    workflow: 'learning-runtime.yml',
    job: 'learning-runtime',
  },
  'dataset-scale': { workflow: 'dataset-scale.yml', job: 'scale' },
  'desktop-qa': { workflow: 'desktop-qa.yml', job: 'desktop-release-qa' },
  coverage: { workflow: 'coverage.yml', job: 'coverage-api' },
  'selfhosted-release-e2e': {
    workflow: 'e2e-selfhosted-release.yml',
    job: 'release-e2e',
  },
  'dependency-update': { workflow: 'deps-update.yml', job: 'update' },
  codeql: { workflow: 'codeql.yml', job: 'analyze' },
  'vulnerability-scan': { workflow: 'security-scan.yml', job: 'trivy-fs' },
};

const LEARNING_SPECS = [
  'test/integration/content-learning/content-learning-runtime.integration.spec.ts',
  'test/integration/content-learning/content-learning-publication-races.integration.spec.ts',
];
const LEARNING_FAMILY = 'learning-runtime';

function parseWorkflow(name) {
  const lines = readFileSync(
    path.join(WORKFLOWS_DIRECTORY, name),
    'utf8',
  ).split('\n');
  const topLevel = (key) => lines.findIndex((line) => line.startsWith(key));
  const blockEnd = (start) => {
    let end = start + 1;
    while (end < lines.length && !/^[A-Za-z]/.test(lines[end])) end += 1;
    return end;
  };
  const onStart = topLevel('on:');
  const onLines =
    onStart < 0 ? [] : lines.slice(onStart + 1, blockEnd(onStart));
  const jobsStart = topLevel('jobs:');
  const jobLines =
    jobsStart < 0 ? [] : lines.slice(jobsStart + 1, blockEnd(jobsStart));
  return {
    name,
    lines,
    isScheduled: onLines.some((line) => /^ {2}schedule:\s*$/.test(line)),
    crons: onLines
      .map((line) => line.match(/^\s+- cron:\s*["']([^"']+)["']/)?.[1])
      .filter(Boolean),
    jobs: jobLines
      .map((line) => line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)?.[1])
      .filter(Boolean),
  };
}

const workflows = readdirSync(WORKFLOWS_DIRECTORY)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map(parseWorkflow);
const scheduled = workflows.filter((workflow) => workflow.isScheduled);
const byName = new Map(workflows.map((workflow) => [workflow.name, workflow]));

test('every scheduled workflow belongs to a declared suite family', () => {
  const owners = new Set(
    Object.values(SUITE_FAMILY_OWNERS).map((owner) => owner.workflow),
  );
  assert.deepEqual(
    scheduled.map((workflow) => workflow.name).sort(),
    [...owners].sort(),
  );
  for (const workflow of scheduled)
    assert.ok(workflow.crons.length > 0, `${workflow.name} has no cron`);
});

test('every suite family keeps exactly one scheduled owner that still defines its job', () => {
  for (const [family, owner] of Object.entries(SUITE_FAMILY_OWNERS)) {
    const workflow = byName.get(owner.workflow);
    assert.ok(workflow, `${family}: ${owner.workflow} is missing`);
    assert.equal(workflow.isScheduled, true, `${family} lost its schedule`);
    assert.ok(
      workflow.jobs.includes(owner.job),
      `${family}: ${owner.workflow} no longer defines job ${owner.job}`,
    );
  }
  const pairs = Object.values(SUITE_FAMILY_OWNERS).map(
    (owner) => `${owner.workflow}#${owner.job}`,
  );
  assert.equal(
    new Set(pairs).size,
    pairs.length,
    'two families share an owner job',
  );
});

test('learning runtime suites run only in learning-runtime.yml among scheduled workflows', () => {
  const owner = SUITE_FAMILY_OWNERS[LEARNING_FAMILY].workflow;
  for (const workflow of scheduled) {
    const learningLines = workflow.lines.filter(
      (line) =>
        /runtime-acceptance\.mjs\s+(?:learning|preflight[^\n]*--group learning)/.test(
          line,
        ) ||
        line.includes('vitest.learning-runtime.config') ||
        LEARNING_SPECS.some((spec) => line.includes(spec)),
    );
    if (workflow.name === owner) {
      assert.ok(learningLines.length > 0, `${owner} does not run learning`);
      continue;
    }
    for (const line of learningLines)
      assert.match(
        line,
        /--exclude\s/,
        `${workflow.name} selects learning specs outside ${owner}: ${line.trim()}`,
      );
  }
});

test('the shared API E2E Full tier excludes every learning spec', () => {
  const e2e = byName.get(SUITE_FAMILY_OWNERS['api-e2e-full'].workflow);
  for (const spec of LEARNING_SPECS)
    assert.ok(
      e2e.lines.some((line) => line.includes(`--exclude ${spec}`)),
      `e2e.yml does not exclude ${spec}`,
    );
});
