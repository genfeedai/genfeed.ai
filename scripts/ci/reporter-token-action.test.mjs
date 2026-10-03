import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readRepoFile(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    'utf8',
  );
}

const ACTION = readRepoFile('.github/actions/reporter-token/action.yml');
const REPORTER_WORKFLOWS = [
  'ci.yml',
  'coverage.yml',
  'e2e-selfhosted-release.yml',
  'e2e.yml',
  'playwright-full-nightly.yml',
];

test('reporter-token mints through the pinned App token action only when both inputs exist', () => {
  assert.match(
    ACTION,
    /uses: actions\/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3\.2\.0/u,
  );
  assert.match(
    ACTION,
    /if: inputs\.client-id != '' && inputs\.private-key != ''/u,
  );
  assert.match(ACTION, /client-id: \$\{\{ inputs\.client-id \}\}/u);
  assert.match(ACTION, /private-key: \$\{\{ inputs\.private-key \}\}/u);
  assert.match(ACTION, /^ {8}owner: genfeedai$/mu);
  assert.match(ACTION, /^ {8}repositories: genfeed\.ai$/mu);
});

test('reporter-token falls back to github.token when the App is not configured', () => {
  assert.match(
    ACTION,
    /value: \$\{\{ steps\.app\.outputs\.token \|\| github\.token \}\}/u,
  );
  assert.match(ACTION, /^ {4}- id: app$/mu);
});

test('reporter-token falls back to github.token when minting fails', () => {
  assert.match(
    ACTION,
    /^ {4}- id: app\n {6}if: [^\n]+\n {6}continue-on-error: true$/mu,
  );
});

test('reporter-token requests only the permissions the reporters call', () => {
  const requested = [...ACTION.matchAll(/^ {8}(permission-[a-z-]+): (\w+)$/gmu)]
    .map((match) => `${match[1]}: ${match[2]}`)
    .sort();
  assert.deepEqual(requested, [
    'permission-issues: write',
    'permission-organization-projects: write',
  ]);
});

test('every failure reporter mints its token from the Genfeed bot App', () => {
  for (const fileName of REPORTER_WORKFLOWS) {
    const workflow = readRepoFile(`.github/workflows/${fileName}`);
    assert.doesNotMatch(workflow, /CONSOLE_DEPLOY_TOKEN/u, fileName);
    assert.equal(
      workflow.match(/uses: \.\/\.github\/actions\/reporter-token/gu)?.length,
      1,
      `${fileName} must use the reporter-token action exactly once`,
    );
    assert.match(
      workflow,
      /client-id: \$\{\{ secrets\.GENFEED_BOT_CLIENT_ID \}\}\n\s+private-key: \$\{\{ secrets\.GENFEED_BOT_PRIVATE_KEY \}\}/u,
      fileName,
    );
    assert.match(
      workflow,
      /github-token: \$\{\{ steps\.reporter-token\.outputs\.token \}\}/u,
      fileName,
    );
  }
});
