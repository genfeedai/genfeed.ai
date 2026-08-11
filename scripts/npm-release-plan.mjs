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
//               scripts/publish-packages-from-json.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPackageInventory } from './publish-packages-from-json.mjs';

const ENROLLMENT_FILE = 'scripts/npm-release-enrollment.json';
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

  return { enrolled: parsed.enrolled, excluded: parsed.excluded };
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
    if (!enrolledSet.has(packagePath) && !excludedSet.has(packagePath)) {
      violations.push(
        `${ENROLLMENT_FILE}: ${packagePath} is publishable but is neither enrolled nor excluded; decide explicitly`,
      );
    }
  }

  for (const packagePath of publicPaths) {
    if (!enrolledSet.has(packagePath)) continue;
    const entry = inventory.byPath.get(packagePath);
    for (const { field, name } of workspaceRuntimeDependencyNames(entry.pkg)) {
      const dependency = inventory.byName.get(name);
      if (!dependency) continue;
      if (excludedSet.has(dependency.path)) {
        violations.push(
          `${ENROLLMENT_FILE}: ${packagePath} is enrolled but ${field}.${name} is excluded (${dependency.path}); an enrolled package cannot depend on an unpublished one`,
        );
      }
    }
  }

  return { checked: publicPaths.length, violations };
}

// publishedVersions: Map<packageName, Set<version> | null>, null = name has
// never existed on npm.
export function planNpmRelease({ enrollment, inventory, publishedVersions }) {
  const { violations } = validateEnrollment({ enrollment, inventory });
  if (violations.length > 0) {
    fail(`npm release enrollment is invalid:\n- ${violations.join('\n- ')}`);
  }

  const bootstrapRequired = [];
  const publish = [];
  const upToDate = [];

  for (const packagePath of [...enrollment.enrolled].sort()) {
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
  if (/E404|No match found|Not Found/i.test(output)) return null;
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

  const publishedVersions = new Map();
  for (const packagePath of enrollment.enrolled) {
    const { name } = inventory.byPath.get(packagePath).pkg;
    publishedVersions.set(name, npmPublishedVersions(name));
  }

  const plan = planNpmRelease({ enrollment, inventory, publishedVersions });
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
