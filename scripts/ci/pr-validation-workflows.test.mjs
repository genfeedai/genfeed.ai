import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WORKFLOWS_DIRECTORY = path.join(REPOSITORY_ROOT, '.github', 'workflows');
const CANCELLABLE_PULL_REQUEST_WORKFLOWS = [
  'ci.yml',
  'codebase-health.yml',
  'curated-action-catalog.yml',
  'deploy-scripts-ci.yml',
  'desktop-qa.yml',
  'link-check.yml',
  'selfhosted-install-smoke.yml',
  'server-image-pr.yml',
];

function readWorkflow(fileName) {
  return readFileSync(path.join(WORKFLOWS_DIRECTORY, fileName), 'utf8');
}

function directPullRequestWorkflows() {
  return readdirSync(WORKFLOWS_DIRECTORY)
    .filter((fileName) => /\.ya?ml$/.test(fileName))
    .filter((fileName) => /^ {2}pull_request:/m.test(readWorkflow(fileName)))
    .sort();
}

function topLevelConcurrencyBlock(workflow, fileName) {
  const match = workflow.match(/^concurrency:\n((?: {2}.*(?:\n|$))+)/m);
  assert.ok(match, `${fileName} must define top-level concurrency`);
  return match[1];
}

test('direct PR workflows cancel only within one PR or complete ref', () => {
  const workflows = directPullRequestWorkflows();
  assert.deepEqual(
    workflows,
    CANCELLABLE_PULL_REQUEST_WORKFLOWS,
    'new PR workflows need an explicit replacement-contract review',
  );

  for (const fileName of workflows) {
    const workflow = readWorkflow(fileName);
    const concurrency = topLevelConcurrencyBlock(workflow, fileName);
    const group = concurrency.match(/^ {2}group: (.+)$/m)?.[1];

    assert.ok(group, `${fileName} must define a concurrency group`);
    assert.match(
      concurrency,
      /^ {2}cancel-in-progress: true$/m,
      `${fileName} must cancel work superseded within its isolated group`,
    );
    assert.doesNotMatch(
      group,
      /github\.(?:head_ref|ref_name|sha)/,
      `${fileName} must not group by a fork-colliding branch name or per-SHA key`,
    );
    assert.match(
      group,
      /github\.(?:ref|event\.pull_request\.number)/,
      `${fileName} must isolate sibling PRs and distinct refs`,
    );
    if (/^ {4}paths:\n/m.test(workflow)) {
      assert.match(
        workflow,
        new RegExp(
          `^ {6}- ['"]?\\.github/workflows/${fileName.replaceAll('.', '\\.')}['"]?$`,
          'm',
        ),
        `${fileName} must trigger when its own routing contract changes`,
      );
    }
  }
});

test('server image PR validation bounds cache export without changing reachability', () => {
  const workflow = readWorkflow('server-image-pr.yml');

  assert.match(workflow, /^ {2}pull_request:\n/m);
  for (const pathFilter of [
    'apps/server/**',
    'packages/**',
    'docker/Dockerfile.server',
    '.github/workflows/server-image-pr.yml',
  ]) {
    assert.ok(
      workflow.includes(`      - '${pathFilter}'\n`),
      `server-image-pr.yml must stay reachable for ${pathFilter}`,
    );
  }
  assert.match(
    workflow,
    /uses: docker\/build-push-action@v7[\s\S]*?push: false/,
  );
  assert.match(workflow, /^ {10}cache-from: type=gha,scope=server-image-pr$/m);
  assert.match(
    workflow,
    /^ {10}cache-to: type=gha,mode=min,scope=server-image-pr,timeout=3m,ignore-error=true$/m,
  );
  assert.doesNotMatch(workflow, /cache-to: type=gha,mode=max/);
  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
});
