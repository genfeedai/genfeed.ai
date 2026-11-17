import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PinnedShaError, resolveReleaseSha } from './release-pinned-sha.mjs';

// Contract for #9579: Release may ship an earlier master commit whose gates
// are already green, so a merge that lands before the dispatch does not make
// that evidence stale.

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = fileURLToPath(
  new URL('./release-pinned-sha.mjs', import.meta.url),
);
const { parse: parseYaml } = createRequire(
  new URL('../../apps/server/api/package.json', import.meta.url),
)('yaml');

function readWorkflow(name) {
  return readFileSync(
    path.join(REPOSITORY_ROOT, '.github', 'workflows', name),
    'utf8',
  );
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(cwd, name) {
  writeFileSync(path.join(cwd, name), `${name}\n`);
  git(cwd, 'add', name);
  git(cwd, 'commit', '--quiet', '-m', name);
  return git(cwd, 'rev-parse', 'HEAD');
}

// master: first -> gated -> head, with `unmerged` branching off `first`.
const history = {};

before(() => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'release-pinned-sha-'));
  git(cwd, 'init', '--quiet', '--initial-branch=master');
  git(cwd, 'config', 'user.email', 'release@example.invalid');
  git(cwd, 'config', 'user.name', 'Release Test');
  git(cwd, 'config', 'commit.gpgsign', 'false');
  history.cwd = cwd;
  history.first = commit(cwd, 'first');
  history.gated = commit(cwd, 'gated');
  history.head = commit(cwd, 'head');
  git(cwd, 'checkout', '--quiet', '-b', 'unmerged', history.first);
  history.unmerged = commit(cwd, 'unmerged');
  git(cwd, 'checkout', '--quiet', 'master');
  // The workflow runs the script by its repository path from the checkout.
  mkdirSync(path.join(cwd, 'scripts', 'ci'), { recursive: true });
  copyFileSync(
    SCRIPT,
    path.join(cwd, 'scripts', 'ci', 'release-pinned-sha.mjs'),
  );
});

after(() => {
  rmSync(history.cwd, { force: true, recursive: true });
});

test('without a sha input Release ships the dispatched head', () => {
  assert.deepEqual(
    resolveReleaseSha({
      pinnedSha: '',
      controllerSha: history.head,
      cwd: history.cwd,
    }),
    { releaseSha: history.head, isPinned: false },
  );
});

test('a sha input naming the dispatched head is an ordinary release', () => {
  assert.deepEqual(
    resolveReleaseSha({
      pinnedSha: history.head,
      controllerSha: history.head,
      cwd: history.cwd,
    }),
    { releaseSha: history.head, isPinned: false },
  );
});

test('an earlier master commit is released while master has moved on', () => {
  assert.deepEqual(
    resolveReleaseSha({
      pinnedSha: history.gated,
      controllerSha: history.head,
      cwd: history.cwd,
    }),
    { releaseSha: history.gated, isPinned: true },
  );
});

test('a commit that never reached master is refused', () => {
  assert.throws(
    () =>
      resolveReleaseSha({
        pinnedSha: history.unmerged,
        controllerSha: history.head,
        cwd: history.cwd,
      }),
    (error) =>
      error instanceof PinnedShaError &&
      error.message ===
        `The sha input ${history.unmerged} is not on master before the dispatched head ${history.head}. Pin a commit that is already merged to master.`,
  );
});

test('a commit newer than the dispatched head is refused', () => {
  assert.throws(
    () =>
      resolveReleaseSha({
        pinnedSha: history.head,
        controllerSha: history.gated,
        cwd: history.cwd,
      }),
    /is not on master before the dispatched head/,
  );
});

test('an unknown commit is refused', () => {
  const unknown = 'ffffffffffffffffffffffffffffffffffffffff';
  assert.throws(
    () =>
      resolveReleaseSha({
        pinnedSha: unknown,
        controllerSha: history.head,
        cwd: history.cwd,
      }),
    (error) =>
      error instanceof PinnedShaError &&
      error.message ===
        `The sha input ${unknown} is not a commit in this repository.`,
  );
});

// Table of inputs refused on shape alone, before git is asked anything.
for (const [label, pinnedSha] of [
  ['a branch name', 'master'],
  ['a tag', 'v1.2.3'],
  ['a short SHA', 'abc1234'],
  ['an uppercase SHA', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
  [
    'a SHA followed by a git option',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --upload-pack=x',
  ],
]) {
  test(`${label} is refused as a sha input`, () => {
    assert.throws(
      () =>
        resolveReleaseSha({
          pinnedSha,
          controllerSha: history.head,
          cwd: history.cwd,
        }),
      (error) =>
        error instanceof PinnedShaError &&
        error.message ===
          `The sha input must be an exact lowercase 40-character commit, not a branch, tag or short SHA: ${pinnedSha}`,
    );
  });
}

test('the command prints only the release SHA and fails closed with an annotation', () => {
  const pinned = spawnSync(process.execPath, [SCRIPT], {
    cwd: history.cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GITHUB_SHA: history.head,
      PINNED_SHA: history.gated,
    },
  });
  assert.deepEqual(
    { status: pinned.status, stdout: pinned.stdout, stderr: pinned.stderr },
    { status: 0, stdout: `${history.gated}\n`, stderr: '' },
  );

  const refused = spawnSync(process.execPath, [SCRIPT], {
    cwd: history.cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GITHUB_SHA: history.head,
      PINNED_SHA: history.unmerged,
    },
  });
  assert.deepEqual(
    { status: refused.status, stdout: refused.stdout },
    { status: 1, stdout: '' },
  );
  assert.match(
    refused.stderr,
    /^::error::The sha input [0-9a-f]{40} is not on master/,
  );
});

function step(job, name) {
  const found = job.steps.filter((candidate) => candidate.name === name);
  assert.equal(found.length, 1, `expected exactly one step named ${name}`);
  return found[0];
}

// Runs a workflow step's own shell script, the way the runner does.
function runStep(stepDefinition, env, cwd = history.cwd) {
  const outputFile = path.join(
    mkdtempSync(path.join(tmpdir(), 'release-pinned-step-')),
    'output',
  );
  writeFileSync(outputFile, '');
  const result = spawnSync('bash', ['-c', stepDefinition.run], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_OUTPUT: outputFile, ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: readFileSync(outputFile, 'utf8'),
  };
}

function releaseValidationStep(name) {
  return step(
    parseYaml(readWorkflow('release.yml')).jobs['validate-release'],
    name,
  );
}

const SOURCE_STEP = 'Resolve release source and recovery evidence';

test('the source step outputs the pinned commit for a normal release', () => {
  const result = runStep(releaseValidationStep(SOURCE_STEP), {
    GITHUB_SHA: history.head,
    PINNED_SHA: history.gated,
    RECOVERY_RUN_ID: '',
    REPAIR_PUBLISHED_RELEASE: 'false',
    REQUESTED_TAG: 'v1.2.3',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.output,
    new RegExp(`^release_sha=${history.gated}$`, 'm'),
  );
  assert.match(result.output, /^recovery_mode=false$/m);
});

test('the source step outputs the dispatched head when no sha is given', () => {
  const result = runStep(releaseValidationStep(SOURCE_STEP), {
    GITHUB_SHA: history.head,
    PINNED_SHA: '',
    RECOVERY_RUN_ID: '',
    REPAIR_PUBLISHED_RELEASE: 'false',
    REQUESTED_TAG: 'v1.2.3',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, new RegExp(`^release_sha=${history.head}$`, 'm'));
});

test('the source step refuses a sha that is not on master and outputs nothing', () => {
  const result = runStep(releaseValidationStep(SOURCE_STEP), {
    GITHUB_SHA: history.head,
    PINNED_SHA: history.unmerged,
    RECOVERY_RUN_ID: '',
    REPAIR_PUBLISHED_RELEASE: 'false',
    REQUESTED_TAG: 'v1.2.3',
  });
  assert.deepEqual(
    { status: result.status, output: result.output },
    { status: 1, output: '' },
  );
  assert.match(
    result.stderr,
    /::error::The sha input [0-9a-f]{40} is not on master/,
  );
});

test('the source step refuses a sha together with historical recovery', () => {
  const result = runStep(releaseValidationStep(SOURCE_STEP), {
    GITHUB_SHA: history.head,
    PINNED_SHA: history.gated,
    RECOVERY_RUN_ID: '37484284049',
    REPAIR_PUBLISHED_RELEASE: 'false',
    REQUESTED_TAG: 'v1.2.3',
  });
  assert.deepEqual(
    { status: result.status, stdout: result.stdout, output: result.output },
    {
      status: 1,
      stdout:
        '::error::The sha input cannot be combined with recovery_run_id or repair_published_release.\n',
      output: '',
    },
  );
});

test('the source step refuses a sha together with published-release repair', () => {
  const result = runStep(releaseValidationStep(SOURCE_STEP), {
    GITHUB_SHA: history.head,
    PINNED_SHA: history.gated,
    RECOVERY_RUN_ID: '',
    REPAIR_PUBLISHED_RELEASE: 'true',
    REQUESTED_TAG: 'v1.2.3',
  });
  assert.deepEqual(
    { status: result.status, stdout: result.stdout, output: result.output },
    {
      status: 1,
      stdout:
        '::error::The sha input cannot be combined with recovery_run_id or repair_published_release.\n',
      output: '',
    },
  );
});

const SUITE_STEP = 'Require existing Full Suite evidence for a pinned SHA';

test('a pinned release with green Full Suite evidence passes the evidence step', () => {
  const result = runStep(releaseValidationStep(SUITE_STEP), {
    GITHUB_SHA: history.head,
    RELEASE_SHA: history.gated,
    SUITE_VERIFIED: 'true',
  });
  assert.deepEqual(
    { status: result.status, stdout: result.stdout },
    { status: 0, stdout: '' },
  );
});

for (const [label, suiteVerified] of [
  ['unqualified', 'false'],
  ['missing', ''],
]) {
  test(`a pinned release with ${label} Full Suite evidence stops at the evidence step`, () => {
    const result = runStep(releaseValidationStep(SUITE_STEP), {
      GITHUB_SHA: history.head,
      RELEASE_SHA: history.gated,
      SUITE_VERIFIED: suiteVerified,
    });
    assert.deepEqual(
      { status: result.status, stdout: result.stdout },
      {
        status: 1,
        stdout: `::error::Release pinned to ${history.gated} has no green Full Suite run with Final Connected Acceptance on that exact commit. The Full Suite inside Release can only test the dispatched head ${history.head}. Pin a commit whose dispatched or nightly Full Suite passed, or dispatch Release without sha.\n`,
      },
    );
  });
}

function npmPlanGuardStep() {
  return step(
    parseYaml(readWorkflow('publish-packages.yml')).jobs.plan,
    'Require an empty npm plan for a pinned release',
  );
}

test('the npm lane accepts a pinned release whose plan is empty', () => {
  const result = runStep(npmPlanGuardStep(), { HAS_PACKAGES: 'false' });
  assert.deepEqual(
    { status: result.status, stdout: result.stdout },
    { status: 0, stdout: '' },
  );
});

for (const [label, hasPackages, shown] of [
  ['pending packages', 'true', 'true'],
  ['no plan result', '', '<empty>'],
]) {
  test(`the npm lane stops a pinned release with ${label}`, () => {
    const result = runStep(npmPlanGuardStep(), { HAS_PACKAGES: hasPackages });
    assert.deepEqual(
      { status: result.status, stdout: result.stdout },
      {
        status: 1,
        stdout: `::error::A pinned release cannot publish pending npm packages (has_packages=${shown}). Cut a release from current master so npm provenance remains truthful.\n`,
      },
    );
  });
}

const PINNED_ONLY =
  "${{ inputs.recovery_run_id == '' && steps.source.outputs.release_sha != github.sha }}";

test('Release resolves the sha input in the controller checkout and keeps recovery and repair apart', () => {
  const release = parseYaml(readWorkflow('release.yml'));
  const validate = release.jobs['validate-release'];
  const names = validate.steps.map((candidate) => candidate.name);
  const source = step(validate, 'Resolve release source and recovery evidence');

  assert.deepEqual(release.on.workflow_dispatch.inputs.sha.required, false);
  assert.equal(release.on.workflow_dispatch.inputs.sha.type, 'string');
  assert.equal(source.env.PINNED_SHA, '${{ inputs.sha }}');
  assert.match(
    source.run,
    /release_sha="\$\{GITHUB_SHA\}"\nif \[ -n "\$\{PINNED_SHA\}" \]; then\n {2}if \[ -n "\$\{RECOVERY_RUN_ID\}" \] \|\| \[ "\$\{REPAIR_PUBLISHED_RELEASE\}" = 'true' \]; then\n {4}echo "::error::The sha input cannot be combined with recovery_run_id or repair_published_release\."\n {4}exit 1\n {2}fi\n {2}release_sha="\$\(node scripts\/ci\/release-pinned-sha\.mjs\)"\nfi/,
  );
  assert.match(source.run, /echo "release_sha=\$\{release_sha\}"/);
  assert.doesNotMatch(source.run, /echo "release_sha=\$\{GITHUB_SHA\}"/);
  assert.ok(
    names.indexOf('Checkout release controller') <
      names.indexOf('Resolve release source and recovery evidence') &&
      names.indexOf('Resolve release source and recovery evidence') <
        names.indexOf('Checkout pinned master SHA'),
    'the pin is validated by the controller copy of the script, before the pinned checkout replaces it',
  );
});

test('a pinned release fails validation without Full Suite evidence or with pending npm packages', () => {
  const release = parseYaml(readWorkflow('release.yml'));
  const validate = release.jobs['validate-release'];
  const names = validate.steps.map((candidate) => candidate.name);
  const npm = step(validate, 'Require an empty npm plan for a pinned SHA');
  const suite = step(
    validate,
    'Require existing Full Suite evidence for a pinned SHA',
  );

  assert.equal(npm.if, PINNED_ONLY);
  assert.match(
    npm.run,
    /GITHUB_OUTPUT="\$\{plan_output\}" node scripts\/npm-release-plan\.mjs --lane release\nif ! grep -qx 'has_packages=false' "\$\{plan_output\}"; then\n {2}echo "::error::[^\n]+"\n {2}exit 1\nfi/,
  );
  assert.ok(
    names.indexOf('Checkout pinned master SHA') < names.indexOf(npm.name) &&
      names.indexOf(npm.name) <
        names.indexOf('Validate version and create or reuse draft release'),
    'the npm plan is read from the pinned checkout before a draft exists',
  );

  assert.equal(suite.if, PINNED_ONLY);
  assert.equal(
    suite.env.SUITE_VERIFIED,
    '${{ steps.suite.outputs.suite_verified }}',
  );
  assert.match(
    suite.run,
    /if \[ "\$\{SUITE_VERIFIED\}" != 'true' \]; then\n {2}echo "::error::[^\n]+"\n {2}exit 1\nfi/,
  );
  assert.ok(
    names.indexOf('Check for existing Full Suite evidence') <
      names.indexOf(suite.name),
  );
});

test('the nested Full Suite only ever runs for the dispatched head', () => {
  const release = parseYaml(readWorkflow('release.yml'));
  assert.equal(
    release.jobs['verify-suite'].if,
    "${{ inputs.recovery_run_id == '' && needs.validate-release.outputs.suite_verified != 'true' && needs.validate-release.outputs.release_sha == github.sha }}",
  );
  assert.equal(release.jobs['verify-suite'].with.ref, undefined);
});

test('every lane after validation ships the resolved release SHA', () => {
  const release = parseYaml(readWorkflow('release.yml'));
  const resolved = '${{ needs.validate-release.outputs.release_sha }}';
  assert.deepEqual(
    {
      community: release.jobs['publish-community'].with.checkout_ref,
      saas: release.jobs['deploy-saas'].with.source_sha,
      notify: release.jobs['notify-release'].with.sha,
      npm: release.jobs['publish-packages'].with.checkout_ref,
      publish: release.jobs['publish-release'].env.RELEASE_SHA,
    },
    {
      community: resolved,
      saas: resolved,
      notify: resolved,
      npm: resolved,
      publish: resolved,
    },
  );
});

test('the npm lane lets a pinned release plan but never publish', () => {
  const release = parseYaml(readWorkflow('release.yml'));
  const packages = parseYaml(readWorkflow('publish-packages.yml'));
  const plan = packages.jobs.plan;
  const names = plan.steps.map((candidate) => candidate.name);
  const source = step(plan, 'Validate pinned release source');
  const guard = step(plan, 'Require an empty npm plan for a pinned release');

  assert.equal(
    release.jobs['publish-packages'].with.pinned_release,
    "${{ needs.validate-release.outputs.recovery_mode != 'true' && needs.validate-release.outputs.release_sha != github.sha }}",
  );
  assert.deepEqual(packages.on.workflow_call.inputs.pinned_release, {
    description:
      'True when Release ships a master commit earlier than the dispatched head; the npm plan must then be empty',
    required: false,
    default: false,
    type: 'boolean',
  });
  assert.equal(packages.on.workflow_dispatch.inputs.pinned_release, undefined);
  assert.match(
    source.run,
    /if \[ "\$\{HEAD_SHA\}" != "\$\{GITHUB_SHA\}" \] && \[ "\$\{PINNED_RELEASE\}" != 'true' \]; then/,
  );
  assert.match(
    source.run,
    /if \[ "\$\{PINNED_RELEASE\}" = 'true' \] && \{ \[ "\$\{TRUSTED_RELEASE_CALL\}" != 'true' \] \|\| \[ "\$\{DRY_RUN\}" != 'false' \] \|\| \[ "\$\{VALIDATED_HISTORICAL_RECOVERY\}" = 'true' \]; \}; then/,
  );
  assert.equal(guard.if, '${{ inputs.pinned_release == true }}');
  assert.match(
    guard.run,
    /if \[ "\$\{HAS_PACKAGES\}" != 'false' \]; then\n {2}echo "::error::[^\n]+"\n {2}exit 1\nfi/,
  );
  assert.ok(
    names.indexOf('Resolve packages to publish') < names.indexOf(guard.name),
  );

  const revalidate = step(
    packages.jobs.publish,
    'Revalidate real publication source',
  );
  assert.match(
    revalidate.run,
    /if \[ "\$\{HEAD_SHA\}" != "\$\{GITHUB_SHA\}" \]; then\n {2}echo "::error::Real package publishes require the dispatched release SHA/,
    'the job that writes to the registry still refuses any commit but the dispatched one',
  );
});
