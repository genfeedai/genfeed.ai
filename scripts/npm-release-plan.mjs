#!/usr/bin/env node
//
// Computes the npm release lane's work automatically so a tagged release
// publishes whatever merged to master, instead of depending on a maintainer
// remembering to hand-write packages_json for a dispatch. That dependency is
// exactly how every public package drifted behind master for five months.
//
// Two responsibilities:
//   --validate  enrollment coverage + dependency closure (a CI guard)
//   --plan      repo-version-vs-registry drift -> packages_json for
//               scripts/publish-packages-from-json.mjs; `--lane dedicated`
//               plans the packages that publish from their own workflow
//   --check-bumps --base <sha>
//               a PR that changes what a published package ships must move
//               its version, so the plan above always has something to
//               publish (#11467)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { readPackageInventory } from './publish-packages-from-json.mjs';

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/;
const NPM_NOT_FOUND_ERROR_PATTERN = /E404|No match found|Not Found/i;

const ENROLLMENT_FILE = 'scripts/npm-release-enrollment.json';
const WORKFLOW_FILE_PATTERN = /^[A-Za-z0-9._-]+\.ya?ml$/;
const RUNTIME_DEPENDENCY_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
];
const REGISTRY_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

class ReleasePlanError extends Error {}

function fail(message) {
  throw new ReleasePlanError(message);
}

export function readEnrollment(root) {
  const enrollmentPath = path.join(root, ENROLLMENT_FILE);
  if (!fs.existsSync(enrollmentPath)) {
    fail(`${ENROLLMENT_FILE} is missing`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(enrollmentPath, 'utf8'));
  } catch (error) {
    fail(`${ENROLLMENT_FILE} is not valid JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed.enrolled)) {
    fail(`${ENROLLMENT_FILE} must declare an "enrolled" array`);
  }
  if (
    !parsed.excluded ||
    typeof parsed.excluded !== 'object' ||
    Array.isArray(parsed.excluded)
  ) {
    fail(
      `${ENROLLMENT_FILE} must declare an "excluded" object of path->reason`,
    );
  }

  const dedicated = parsed.dedicated ?? {};
  if (!dedicated || typeof dedicated !== 'object' || Array.isArray(dedicated)) {
    fail(
      `${ENROLLMENT_FILE} "dedicated" must be an object of path->workflow file`,
    );
  }

  return {
    dedicated,
    enrolled: parsed.enrolled,
    excluded: parsed.excluded,
  };
}

function publicPackagePaths(inventory) {
  return inventory.packages
    .filter(
      (entry) => entry.pkg.private !== true && Boolean(entry.pkg.publishConfig),
    )
    .map((entry) => entry.path)
    .sort();
}

function workspaceRuntimeDependencyNames(pkg) {
  const names = [];
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    for (const [name, specifier] of Object.entries(pkg[field] ?? {})) {
      if (typeof specifier === 'string' && specifier.startsWith('workspace:')) {
        names.push({ field, name });
      }
    }
  }
  return names;
}

// An enrolled package that depends on an excluded one would publish a manifest
// pointing at a version npm has never seen: installable, broken on require.
// The publish script's registry-closure check would catch it mid-release; this
// catches it on the PR that changes either list.
export function validateEnrollment({ enrollment, inventory }) {
  const violations = [];
  const publicPaths = publicPackagePaths(inventory);
  const publicPathSet = new Set(publicPaths);
  const enrolledSet = new Set();
  const dedicated = enrollment.dedicated ?? {};
  const dedicatedSet = new Set(Object.keys(dedicated));
  const excludedSet = new Set(Object.keys(enrollment.excluded));

  for (const packagePath of enrollment.enrolled) {
    if (typeof packagePath !== 'string' || packagePath.length === 0) {
      violations.push(
        `${ENROLLMENT_FILE}: "enrolled" entries must be non-empty strings`,
      );
      continue;
    }
    if (enrolledSet.has(packagePath)) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} is listed twice in "enrolled"`,
      );
      continue;
    }
    enrolledSet.add(packagePath);
    if (!publicPathSet.has(packagePath)) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} is enrolled but is not a public package under packages/`,
      );
    }
  }

  // A dedicated package publishes from the workflow file named here, and npm
  // allows one trusted publisher per package, so it cannot also ride the
  // release lane.
  for (const [packagePath, workflowFile] of Object.entries(dedicated)) {
    if (
      typeof workflowFile !== 'string' ||
      !WORKFLOW_FILE_PATTERN.test(workflowFile)
    ) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} must name the workflow file that publishes it, such as "publish-shared-packages.yml"`,
      );
    }
    if (!publicPathSet.has(packagePath)) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} is dedicated but is not a public package under packages/`,
      );
    }
    if (enrolledSet.has(packagePath)) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} is both enrolled and dedicated`,
      );
    }
    if (excludedSet.has(packagePath)) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} is both dedicated and excluded`,
      );
    }
  }

  for (const [packagePath, reason] of Object.entries(enrollment.excluded)) {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} must document why it is excluded`,
      );
    }
    if (!publicPathSet.has(packagePath)) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} is excluded but is not a public package under packages/`,
      );
    }
    if (enrolledSet.has(packagePath)) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} is both enrolled and excluded`,
      );
    }
  }

  for (const packagePath of publicPaths) {
    if (
      !enrolledSet.has(packagePath) &&
      !dedicatedSet.has(packagePath) &&
      !excludedSet.has(packagePath)
    ) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} is publishable but is neither enrolled, dedicated nor excluded; decide explicitly`,
      );
    }
  }

  for (const packagePath of publicPaths) {
    if (!enrolledSet.has(packagePath) && !dedicatedSet.has(packagePath)) {
      continue;
    }
    const lane = enrolledSet.has(packagePath) ? 'enrolled' : 'dedicated';
    const entry = inventory.byPath.get(packagePath);
    for (const { field, name } of workspaceRuntimeDependencyNames(entry.pkg)) {
      const dependency = inventory.byName.get(name);
      if (!dependency) continue;
      if (excludedSet.has(dependency.path)) {
        violations.push(
          `${ENROLLMENT_FILE}: ${packagePath} is ${lane} but ${field}.${name} is excluded (${dependency.path}); ${lane === 'enrolled' ? 'an enrolled' : 'a dedicated'} package cannot depend on an unpublished one`,
        );
      }
    }
  }

  return { checked: publicPaths.length, violations };
}

// The packages one publishing workflow owns. `release` is the stable release
// lane (enrolled); `dedicated` is the on-demand workflow for the shared design
// layer. A package is in exactly one lane (validateEnrollment).
export function lanePackagePaths(enrollment, lane) {
  if (lane === 'release') return [...enrollment.enrolled].sort();
  if (lane === 'dedicated')
    return Object.keys(enrollment.dedicated ?? {}).sort();
  return fail(
    `Unknown npm release lane "${lane}". Use "release" or "dedicated".`,
  );
}

// publishedVersions: Map<packageName, Set<version> | null>, null = name has
// never existed on npm.
export function planNpmRelease({
  enrollment,
  inventory,
  lane = 'release',
  publishedVersions,
}) {
  const { violations } = validateEnrollment({ enrollment, inventory });
  if (violations.length > 0) {
    fail(`npm release enrollment is invalid:\n- ${violations.join('\n- ')}`);
  }

  const bootstrapRequired = [];
  const publish = [];
  const upToDate = [];

  for (const packagePath of lanePackagePaths(enrollment, lane)) {
    const entry = inventory.byPath.get(packagePath);
    const { name, version } = entry.pkg;
    const versions = publishedVersions.get(name);

    if (versions == null) {
      bootstrapRequired.push({ name, path: packagePath, version });
      continue;
    }
    if (versions.has(version)) {
      upToDate.push({ name, path: packagePath, version });
      continue;
    }
    publish.push({ name, path: packagePath, version });
  }

  return {
    bootstrapRequired,
    excluded: Object.entries(enrollment.excluded)
      .map(([packagePath, reason]) => ({ path: packagePath, reason }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    publish,
    upToDate,
  };
}

// npm OIDC cannot create a package name, so an enrolled-but-nonexistent name is
// a release blocker a maintainer must clear out of band. Fail here with the fix
// rather than 25 minutes later inside preflight.
export function assertPublishable(plan) {
  if (plan.bootstrapRequired.length === 0) return;
  const detail = plan.bootstrapRequired
    .map((entry) => `${entry.name}@${entry.version} (${entry.path})`)
    .join('\n- ');
  fail(
    `npm trusted publishing cannot perform a first publish, and these enrolled packages do not exist on npm:\n- ${detail}\n\n` +
      'An npm owner must bootstrap each name once from a preflight tarball, then configure its trusted publisher. ' +
      `Alternatively move the package to "excluded" in ${ENROLLMENT_FILE} — only allowed when no enrolled package depends on it.`,
  );
}

// A path the published tarball is not built from. Everything else under a
// published package counts as source: the tarball is built from `src` (or the
// CSS files themselves), so a change there reaches npm users only through a
// new version.
const NON_SHIPPED_PATH_PATTERN =
  /(?:\.(?:spec|test|stories)\.[cm]?[jt]sx?$|\.mdx?$|(?:^|\/)(?:__tests__|__mocks__|__fixtures__|fixtures|tests?|coverage|node_modules|dist)\/|(?:^|\/)(?:tsconfig[^/]*\.json|vitest\.config\.[cm]?[jt]s|biome\.jsonc?)$)/;
// Manifest fields that never reach a consumer's install.
const UNSHIPPED_MANIFEST_FIELDS = ['version', 'scripts', 'devDependencies'];

export function isShippedSourcePath(relativePath) {
  return !NON_SHIPPED_PATH_PATTERN.test(relativePath);
}

function shippedManifestFields(manifest) {
  const copy = { ...manifest };
  for (const field of UNSHIPPED_MANIFEST_FIELDS) delete copy[field];
  return copy;
}

export function manifestShipsChange(baseManifest, headManifest) {
  return !isDeepStrictEqual(
    shippedManifestFields(baseManifest),
    shippedManifestFields(headManifest),
  );
}

// packages: [{ name, path, baseVersion, headVersion, shippedFiles }] for every
// published package whose shipped files changed in the pull request.
// publishedVersions: Map<packageName, Set<version> | null>.
//
// A package only needs a bump when the version its base already carries is on
// npm. When the base carries a version nobody published yet, an earlier merge
// has already moved it and this change rides that publish; asking every pull
// request for its own bump would make two pull requests that touch the same
// package conflict on one line.
export function findStalePackageVersions({ packages, publishedVersions }) {
  const violations = [];
  for (const entry of packages) {
    if (entry.shippedFiles.length === 0) continue;
    const versions = publishedVersions.get(entry.name);
    if (versions == null) continue;

    const changed = `${entry.shippedFiles.length} shipped file(s), such as ${entry.shippedFiles[0]}`;
    if (entry.headVersion === entry.baseVersion) {
      if (!versions.has(entry.baseVersion)) continue;
      violations.push(
        `${entry.name} (${entry.path}): ${changed} changed, but version ${entry.headVersion} is already on npm. Bump "version" in ${entry.path}/package.json (a patch for a fix, a minor for a feature) so the next publish carries this change.`,
      );
    } else if (versions.has(entry.headVersion)) {
      violations.push(
        `${entry.name} (${entry.path}): version ${entry.headVersion} is already on npm, so it cannot carry the ${changed}. Move "version" in ${entry.path}/package.json past it.`,
      );
    }
  }
  return violations;
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readManifestAt(root, ref, packagePath) {
  try {
    return JSON.parse(
      git(root, ['show', `${ref}:${packagePath}/package.json`]),
    );
  } catch {
    return null;
  }
}

function collectChangedPackages({ base, enrollment, root }) {
  const packages = [];
  const packagePaths = [
    ...lanePackagePaths(enrollment, 'release'),
    ...lanePackagePaths(enrollment, 'dedicated'),
  ];
  for (const packagePath of packagePaths) {
    const baseManifest = readManifestAt(root, base, packagePath);
    // A package that did not exist at the base has no published version to
    // compare against; the enrollment check covers its first publish.
    if (!baseManifest) continue;
    const headManifest = JSON.parse(
      fs.readFileSync(path.join(root, packagePath, 'package.json'), 'utf8'),
    );
    // The base against the working tree, so a local run also sees staged,
    // unstaged and untracked edits; in CI the working tree is the head.
    const changedFiles = [
      ...git(root, [
        'diff',
        '--name-only',
        base,
        '--',
        `${packagePath}/`,
      ]).split('\n'),
      ...git(root, [
        'ls-files',
        '--others',
        '--exclude-standard',
        '--',
        `${packagePath}/`,
      ]).split('\n'),
    ]
      .filter(Boolean)
      .map((file) => file.slice(packagePath.length + 1));

    const shippedFiles = changedFiles.filter((file) =>
      file === 'package.json'
        ? manifestShipsChange(baseManifest, headManifest)
        : isShippedSourcePath(file),
    );
    packages.push({
      baseVersion: baseManifest.version,
      headVersion: headManifest.version,
      name: headManifest.name,
      path: packagePath,
      shippedFiles,
    });
  }
  return packages;
}

function npmPublishedVersions(packageName) {
  const result = spawnSync('npm', ['view', packageName, 'versions', '--json'], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: REGISTRY_COMMAND_TIMEOUT_MS,
  });

  if (result.status === 0) {
    const parsed = JSON.parse(result.stdout || 'null');
    if (parsed === null) return new Set();
    return new Set(Array.isArray(parsed) ? parsed : [parsed]);
  }
  if (result.error?.code === 'ETIMEDOUT') {
    fail(`npm view ${packageName} timed out`);
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (NPM_NOT_FOUND_ERROR_PATTERN.test(output)) return null;
  fail(`npm view ${packageName} failed\n${output.trim()}`);
}

function appendGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.appendFileSync(outputPath, `${lines}\n`);
}

function appendGithubSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${markdown}\n`);
}

function renderSummary(plan) {
  const lines = ['## npm release plan', ''];
  if (plan.publish.length === 0) {
    lines.push(
      'Every enrolled package version is already on npm. Nothing to publish.',
    );
  } else {
    lines.push('| package | version |', '| --- | --- |');
    for (const entry of plan.publish) {
      lines.push(`| \`${entry.name}\` | ${entry.version} |`);
    }
  }
  if (plan.upToDate.length > 0) {
    lines.push('', `Already published: ${plan.upToDate.length} package(s).`);
  }
  if (plan.excluded.length > 0) {
    lines.push(
      '',
      '<details><summary>Not enrolled in the automated lane</summary>',
      '',
    );
    for (const entry of plan.excluded) {
      lines.push(`- \`${entry.path}\` — ${entry.reason}`);
    }
    lines.push('', '</details>');
  }
  return lines.join('\n');
}

function runCli() {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const inventory = readPackageInventory(root);
  const enrollment = readEnrollment(root);

  if (args.includes('--validate')) {
    const { checked, violations } = validateEnrollment({
      enrollment,
      inventory,
    });
    for (const [packagePath, workflowFile] of Object.entries(
      enrollment.dedicated,
    )) {
      const workflowPath = path.join('.github/workflows', workflowFile);
      if (!fs.existsSync(path.join(root, workflowPath))) {
        violations.push(
          `${ENROLLMENT_FILE}: ${packagePath} names ${workflowPath} as its publisher, but that workflow does not exist`,
        );
      }
    }
    if (violations.length > 0) {
      console.error('npm release enrollment violations found:\n');
      for (const violation of violations) console.error(`- ${violation}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `npm release enrollment check passed for ${checked} public package directories.`,
    );
    return;
  }

  if (args.includes('--check-bumps')) {
    const baseFlag = args.indexOf('--base');
    const base = baseFlag === -1 ? '' : (args[baseFlag + 1] ?? '');
    if (!COMMIT_SHA_PATTERN.test(base)) {
      fail('--check-bumps needs --base <commit sha>');
    }
    const validation = validateEnrollment({ enrollment, inventory });
    if (validation.violations.length > 0) {
      fail(
        `npm release enrollment is invalid:\n- ${validation.violations.join('\n- ')}`,
      );
    }
    const packages = collectChangedPackages({ base, enrollment, root });
    const publishedVersions = new Map();
    for (const entry of packages) {
      if (entry.shippedFiles.length > 0) {
        publishedVersions.set(entry.name, npmPublishedVersions(entry.name));
      }
    }
    const violations = findStalePackageVersions({
      packages,
      publishedVersions,
    });
    if (violations.length > 0) {
      console.error('Published packages changed without a new version:\n');
      for (const violation of violations) console.error(`- ${violation}`);
      process.exitCode = 1;
      return;
    }
    const checked = packages.filter((entry) => entry.shippedFiles.length > 0);
    console.log(
      checked.length === 0
        ? 'No published package ships a change in this diff.'
        : `Published package versions cover this diff: ${checked.map((entry) => entry.name).join(', ')}.`,
    );
    return;
  }

  const laneFlag = args.indexOf('--lane');
  const lane = laneFlag === -1 ? 'release' : (args[laneFlag + 1] ?? '');

  const publishedVersions = new Map();
  for (const packagePath of lanePackagePaths(enrollment, lane)) {
    const { name } = inventory.byPath.get(packagePath).pkg;
    publishedVersions.set(name, npmPublishedVersions(name));
  }

  const plan = planNpmRelease({
    enrollment,
    inventory,
    lane,
    publishedVersions,
  });
  assertPublishable(plan);

  const packagesJson = JSON.stringify(
    plan.publish.map(({ path: packagePath, version }) => ({
      path: packagePath,
      version,
    })),
  );

  console.log(renderSummary(plan));
  appendGithubSummary(renderSummary(plan));
  appendGithubOutput({
    has_packages: plan.publish.length > 0 ? 'true' : 'false',
    packages_json: packagesJson,
  });
}

const isDirectInvocation =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectInvocation) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
