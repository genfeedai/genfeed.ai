import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scriptPath = path.join(root, 'scripts', 'publish-package.sh');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = version.split('.').map(Number);

  if (![major, minor, patch].every((part) => Number.isInteger(part))) {
    fail(`Unsupported version format: ${version}`);
  }

  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      fail(`Unsupported bump type: ${bump}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const args = process.argv.slice(2);
const packagesArgIndex = args.indexOf('--packages-json');
const dryRun = args.includes('--dry-run');

if (packagesArgIndex === -1 || !args[packagesArgIndex + 1]) {
  fail(
    "Usage: node scripts/publish-packages-from-json.mjs --packages-json '<json>' [--dry-run]",
  );
}

let requests;
try {
  requests = JSON.parse(args[packagesArgIndex + 1]);
} catch (error) {
  fail(
    `Failed to parse --packages-json: ${error instanceof Error ? error.message : String(error)}`,
  );
}

if (!Array.isArray(requests) || requests.length === 0) {
  fail('--packages-json must be a non-empty array');
}

const validBumps = new Set(['patch', 'minor', 'major']);
const seenPaths = new Set();

const normalizedRequests = requests.map((request, index) => {
  if (!request || typeof request !== 'object') {
    fail(`packages_json[${index}] must be an object`);
  }

  const candidatePath =
    typeof request.path === 'string' ? request.path.trim() : '';
  const bump = typeof request.bump === 'string' ? request.bump.trim() : '';

  if (!candidatePath) {
    fail(`packages_json[${index}].path is required`);
  }
  if (!validBumps.has(bump)) {
    fail(
      `packages_json[${index}].bump must be one of: ${Array.from(validBumps).join(', ')}`,
    );
  }

  const packageDir = path.resolve(root, candidatePath);
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!packageJsonPath.startsWith(root)) {
    fail(`packages_json[${index}].path resolves outside the repo`);
  }
  if (!fs.existsSync(packageJsonPath)) {
    fail(`No package.json found for ${candidatePath}`);
  }
  if (seenPaths.has(packageDir)) {
    fail(`Duplicate package path in request: ${candidatePath}`);
  }
  seenPaths.add(packageDir);

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (pkg.private === true) {
    fail(`${candidatePath} is private and cannot be published`);
  }
  if (!pkg.publishConfig) {
    fail(`${candidatePath} has no publishConfig and cannot be published`);
  }

  return {
    bump,
    currentVersion: pkg.version,
    name: pkg.name,
    packageDir,
    packageJsonPath,
    path: candidatePath,
  };
});

run('node', [
  'scripts/check-public-package-manifests.mjs',
  ...normalizedRequests.map((request) => request.path),
]);

const releases = [];

for (const request of normalizedRequests) {
  const publishArgs = [request.path, request.bump];

  if (dryRun) {
    publishArgs.push('--dry-run');
  }

  console.log(`\n=== ${dryRun ? 'Dry Run' : 'Publish'} ${request.path} ===`);
  run(scriptPath, publishArgs);
  releases.push({
    name: request.name,
    path: request.path,
    version:
      request.bump === 'patch' ||
      request.bump === 'minor' ||
      request.bump === 'major'
        ? bumpVersion(request.currentVersion, request.bump)
        : request.currentVersion,
  });
}

const outputPath =
  process.env.PACKAGE_RELEASE_OUTPUT &&
  path.resolve(root, process.env.PACKAGE_RELEASE_OUTPUT);

if (outputPath) {
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ dryRun, releases }, null, 2) + '\n',
  );
}

console.log('\nRelease summary:');
for (const release of releases) {
  console.log(`- ${release.name}@${release.version} (${release.path})`);
}
