import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const releaseWorkflow = readFileSync(
  fileURLToPath(
    new URL('../../.github/workflows/release.yml', import.meta.url),
  ),
  'utf8',
);

function jobBlock(jobId) {
  const match = releaseWorkflow.match(
    new RegExp(`^  ${jobId}:\\n((?:    .*?(?:\\n|$)|\\n)+)`, 'm'),
  );
  assert.ok(match, `release.yml must define the ${jobId} job`);
  return match[1];
}

test('dispatches the exact stable-release SHA to private operations', () => {
  const deploy = jobBlock('deploy-saas');

  assert.match(deploy, /CONSOLE_REPOSITORY: genfeedai\/console\.genfeed\.ai/);
  assert.match(deploy, /CONSOLE_WORKFLOW: deploy-hosted-saas\.yml/);
  assert.match(deploy, /GH_TOKEN: \$\{\{ secrets\.CONSOLE_DEPLOY_TOKEN \}\}/);
  assert.match(
    deploy,
    /RELEASE_SHA: \$\{\{ needs\.validate-release\.outputs\.release_sha \}\}/,
  );
  assert.match(
    deploy,
    /ref: \$\{\{ needs\.validate-release\.outputs\.release_sha \}\}/,
  );
  assert.match(deploy, /node scripts\/ci\/dispatch-hosted-saas\.mjs/);
  assert.doesNotMatch(deploy, /inputs\[release_sha\]=/);
  assert.doesNotMatch(
    deploy,
    /id-token: write|secrets: inherit|_deploy-ecs-core/,
  );
});

test('fails closed while correlating and waiting for private deployment', () => {
  const deploy = jobBlock('deploy-saas');

  assert.match(deploy, /display_title == \$title/);
  assert.match(deploy, /event == "workflow_dispatch"/);
  assert.match(deploy, /head_branch == "master"/);
  assert.match(deploy, /Ambiguous private deploy handoff/);
  assert.match(deploy, /No private deployment run matched/);
  assert.match(deploy, /Private run identity changed/);
  assert.match(deploy, /conclusion\}" != "success"/);
  assert.match(deploy, /deployment timed out after 170 minutes/);
});

test('blocks irreversible release promotion on private deployment success', () => {
  for (const jobId of [
    'promote-community',
    'publish-packages',
    'publish-release',
  ]) {
    assert.match(
      jobBlock(jobId),
      /needs:[\s\S]*deploy-saas/,
      `${jobId} must wait for deploy-saas`,
    );
  }
});
