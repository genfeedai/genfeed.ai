import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WORKFLOWS_DIRECTORY = path.join(REPOSITORY_ROOT, '.github', 'workflows');
const FULL_TIER_WORKFLOW = 'playwright-full-nightly.yml';
const PRODUCTION_CONTROL_WORKFLOWS = [
  'full-suite.yml',
  'daily-production-deploy.yml',
  'release.yml',
  'docker-publish.yml',
];

function readWorkflow(fileName) {
  return readFileSync(path.join(WORKFLOWS_DIRECTORY, fileName), 'utf8');
}

function jobBlock(workflow, jobId, fileName) {
  const match = workflow.match(
    new RegExp(`^ {2}${jobId}:\\n((?: {4}.*(?:\\n|$)|\\n)+)`, 'm'),
  );
  assert.ok(match, `${fileName} must define the ${jobId} job`);
  return match[1];
}

test('Playwright full-tier nightly workflow exists as a standalone reporter', () => {
  const filePath = path.join(WORKFLOWS_DIRECTORY, FULL_TIER_WORKFLOW);
  assert.equal(
    existsSync(filePath),
    true,
    `${FULL_TIER_WORKFLOW} must exist so the first scheduled run can record inventory`,
  );

  const workflow = readWorkflow(FULL_TIER_WORKFLOW);
  assert.match(workflow, /^ {2}schedule:\n {4}- cron:/m);
  assert.match(workflow, /^ {2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(
    workflow,
    /^ {2}workflow_call:/m,
    'the full tier must not be reusable by deploy callers',
  );
  assert.match(workflow, /node scripts\/playwright-e2e-tiers\.mjs/);
  assert.match(workflow, /playwright-full-tier-summary/);
  assert.match(workflow, /playwright-report-full-merged/);
  assert.match(workflow, /playwright-full-traces/);
  assert.match(workflow, /playwright-full-screenshots/);
  assert.match(workflow, /playwright-full-json-/);
  assert.match(workflow, /--playwright-reports-dir=/);

  const shardJsonDownload = workflow.match(
    /^ {6}- name: Download shard JSON reports\n((?: {8}.*\n|\n)+)/m,
  );
  assert.ok(
    shardJsonDownload,
    'the full-tier summary must download every shard JSON artifact',
  );
  assert.match(shardJsonDownload[0], /pattern: playwright-full-json-\*/);
  assert.match(
    shardJsonDownload[0],
    /path: playwright\/artifacts\/report\/shards\//,
  );
  assert.doesNotMatch(
    shardJsonDownload[0],
    /merge-multiple:\s*true/,
    'same-name results.json files must stay in per-artifact directories',
  );

  assert.doesNotMatch(
    workflow,
    /^\s*run:.*--reporter=blob/m,
    'CLI --reporter=blob replaces config reporters and drops results.json',
  );
  assert.match(workflow, /nightly-playwright-full-failure-reporter\.mjs/);
  assert.match(workflow, /reportNightlyPlaywrightFullFailure/);
  assert.match(workflow, /resolveNightlyPlaywrightFullFailures/);
  assert.match(workflow, /^ {2}nightly-recovery-report:/m);
  assert.match(
    workflow,
    /github-token: \$\{\{ secrets\.CONSOLE_DEPLOY_TOKEN \}\}/,
  );
});

test('full-suite.yml and daily-production-deploy.yml do not depend on the reporting-only full tier', () => {
  for (const fileName of PRODUCTION_CONTROL_WORKFLOWS) {
    const filePath = path.join(WORKFLOWS_DIRECTORY, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const workflow = readFileSync(filePath, 'utf8');
    assert.doesNotMatch(
      workflow,
      /playwright-full-nightly/,
      `${fileName} must not uses/needs the reporting-only Playwright full tier`,
    );
  }
});

test('no workflow other than the nightly full tier calls playwright-full-nightly.yml', () => {
  const callers = readdirSync(WORKFLOWS_DIRECTORY)
    .filter((fileName) => /\.ya?ml$/.test(fileName))
    .filter((fileName) => fileName !== FULL_TIER_WORKFLOW)
    .filter((fileName) =>
      /uses:\s*\.\/\.github\/workflows\/playwright-full-nightly\.yml|needs:.*playwright-full-nightly/.test(
        readWorkflow(fileName),
      ),
    );

  assert.deepEqual(
    callers,
    [],
    'deploy and PR workflows must not uses/needs the reporting-only full tier',
  );
});

test('e2e.yml core and authed jobs remain the production deploy gates', () => {
  const workflow = readWorkflow('e2e.yml');
  const gate = jobBlock(workflow, 'e2e-gate', 'e2e.yml');
  const frontend = jobBlock(workflow, 'e2e-frontend', 'e2e.yml');
  const authed = jobBlock(workflow, 'e2e-frontend-authed', 'e2e.yml');

  assert.match(gate, /needs: \[e2e-route-coverage, e2e-frontend, e2e-api\]/);
  assert.doesNotMatch(gate, /playwright-full|e2e-frontend-full|test:e2e:full/);
  assert.doesNotMatch(
    gate,
    /e2e-isolated-publish|test:e2e:isolated-publish/,
    'isolated-publish must not attach to the production e2e-gate',
  );
  assert.match(frontend, /bun run test:e2e:sharded -- --reporter=blob/);
  assert.doesNotMatch(frontend, /test:e2e:full|playwright-e2e-tiers/);
  assert.match(authed, /bun run test:e2e:authed/);
  assert.match(
    authed,
    /continue-on-error: \$\{\{ github\.event_name != 'schedule' \}\}/,
    'authed job must stay non-gating on the deploy path',
  );
});

test('e2e.yml downloads the four current-run blob reports with bounded diagnostics', () => {
  const workflow = readWorkflow('e2e.yml');
  const frontend = jobBlock(workflow, 'e2e-frontend', 'e2e.yml');
  const merge = jobBlock(workflow, 'e2e-merge-reports', 'e2e.yml');

  assert.match(
    frontend,
    /name: blob-report-\$\{\{ matrix\.shard \}\}[\s\S]*?if-no-files-found: error/,
    'a shard that produced no blob report must fail at the named upload step',
  );

  for (const shard of [1, 2, 3, 4]) {
    assert.match(
      merge,
      new RegExp(
        `- name: Download blob report \\(shard ${shard}\\)[\\s\\S]*?` +
          `id: download-blob-report-${shard}[\\s\\S]*?` +
          `continue-on-error: true[\\s\\S]*?` +
          `name: blob-report-${shard}[\\s\\S]*?` +
          `repository: \\$\\{\\{ github\\.repository \\}\\}[\\s\\S]*?` +
          `run-id: \\$\\{\\{ github\\.run_id \\}\\}`,
      ),
      `blob-report-${shard} must be downloaded explicitly from the current run`,
    );
    assert.match(
      merge,
      new RegExp(
        `BLOB_REPORT_${shard}_RESULT: \\$\\{\\{ steps\\.download-blob-report-${shard}\\.outcome \\}\\}`,
      ),
      `blob-report-${shard} must contribute to the bounded diagnostic`,
    );
  }

  assert.doesNotMatch(
    merge,
    /pattern: blob-report-\*/,
    'parallel wildcard downloads obscure which required artifact failed',
  );
  assert.match(merge, /Classification: report-infrastructure/);
  assert.match(merge, /Missing or unavailable required artifacts:/);
  assert.match(merge, /\$GITHUB_STEP_SUMMARY/);
  assert.match(
    merge,
    /name: playwright-report-merged[\s\S]*?retention-days: 7[\s\S]*?if-no-files-found: error/,
  );
});

test('isolated-publish lane is nightly-only and off the production gate', () => {
  const workflow = readWorkflow('e2e.yml');
  const isolated = jobBlock(workflow, 'e2e-isolated-publish', 'e2e.yml');
  const gate = jobBlock(workflow, 'e2e-gate', 'e2e.yml');

  assert.match(isolated, /test:e2e:isolated-publish/);
  assert.match(
    isolated,
    /github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/,
  );
  assert.doesNotMatch(gate, /e2e-isolated-publish/);
});

test('canonical e2e tier contract documents core, authed, full, and isolated-publish', () => {
  const doc = readFileSync(
    path.join(REPOSITORY_ROOT, 'docs', 'e2e-tiers.md'),
    'utf8',
  );
  const packageJson = JSON.parse(
    readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  );
  const apiPackageJson = JSON.parse(
    readFileSync(
      path.join(REPOSITORY_ROOT, 'apps', 'server', 'api', 'package.json'),
      'utf8',
    ),
  );

  for (const tier of ['core', 'authed', 'full', 'isolated-publish']) {
    assert.match(doc, new RegExp(`\`${tier}\``));
  }
  assert.match(doc, /test:e2e:core/);
  assert.match(doc, /test:e2e:authed/);
  assert.match(doc, /test:e2e:full/);
  assert.match(doc, /test:e2e:isolated-publish/);
  assert.match(doc, /apps\/server\/api/);
  assert.equal(
    packageJson.scripts['test:e2e:core'].includes('--project=app-core'),
    true,
  );
  assert.equal(
    packageJson.scripts['test:e2e:authed'].includes('--project=app-authed'),
    true,
  );
  assert.equal(
    packageJson.scripts['test:e2e:full'],
    'node scripts/playwright-e2e-tiers.mjs',
  );
  assert.equal(apiPackageJson.scripts['test:e2e:core'] !== undefined, true);
  assert.equal(apiPackageJson.scripts['test:e2e:full'] !== undefined, true);
  assert.equal(
    apiPackageJson.scripts['test:e2e:isolated-publish'] !== undefined,
    true,
  );
});

test('the existing executable-contract aggregate includes focused scheduled reporter tests', () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  );
  const aggregate = packageJson.scripts['test:executable-contracts'];
  const adjacentContract = readFileSync(
    path.join(REPOSITORY_ROOT, 'scripts/ci/pr-validation-workflows.test.mjs'),
    'utf8',
  );

  assert.match(aggregate, /scripts\/ci\/pr-validation-workflows\.test\.mjs/);
  for (const focusedTest of [
    'scheduled-failure-tracker.test.mjs',
    'nightly-e2e-failure-reporter.test.mjs',
    'nightly-playwright-full-failure-reporter.test.mjs',
    'coverage-failure-reporter.test.mjs',
  ]) {
    assert.match(
      adjacentContract,
      new RegExp(focusedTest.replaceAll('.', '\\.')),
    );
  }
});
