#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_REPOSITORY_URL =
  'git+https://github.com/genfeedai/genfeed.ai.git';
const SUPPORTED_LICENSES = new Set(['AGPL-3.0', 'AGPL-3.0-or-later', 'MIT']);
const RUNTIME_DEPENDENCY_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
];

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function isSrcPath(value) {
  const normalized =
    typeof value === 'string' ? value.replace(/^\.\//, '') : '';
  return normalized === 'src' || normalized.startsWith('src/');
}

function isAllowedSourceAsset(value) {
  return typeof value === 'string' && /\.(css|json)$/.test(value);
}

function collectStringValues(value, values = []) {
  if (typeof value === 'string') {
    values.push(value);
    return values;
  }

  if (value && typeof value === 'object') {
    for (const child of Object.values(value))
      collectStringValues(child, values);
  }

  return values;
}

function isPublishedByFiles(target, files) {
  const normalizedTarget = target.replace(/^\.\//, '');
  return files.some((entry) => {
    const normalizedEntry = entry.replace(/^\.\//, '').replace(/\/$/, '');
    return (
      normalizedTarget === normalizedEntry ||
      normalizedTarget.startsWith(`${normalizedEntry}/`)
    );
  });
}

function sourceEntryContainsOnlyAssets(packageDir, entry) {
  const absoluteEntry = path.join(packageDir, entry);
  if (!fs.existsSync(absoluteEntry)) return false;

  const stack = [absoluteEntry];
  let foundFile = false;
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(current)) {
        stack.push(path.join(current, child));
      }
      continue;
    }

    foundFile = true;
    if (!isAllowedSourceAsset(current)) return false;
  }

  return foundFile;
}

function validatePublicPackage({ dir, pkg, packageByName, root, violations }) {
  const rel = path.relative(root, path.join(dir, 'package.json'));
  const packageRel = path.relative(root, dir).split(path.sep).join('/');

  if (!pkg.name?.startsWith('@genfeedai/')) {
    violations.push(
      `${rel}: public package name must use the @genfeedai scope`,
    );
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? '')) {
    violations.push(`${rel}: missing or unsupported semantic "version"`);
  }
  if (!SUPPORTED_LICENSES.has(pkg.license)) {
    violations.push(
      `${rel}: license must be an explicit supported SPDX identifier (${Array.from(SUPPORTED_LICENSES).join(', ')})`,
    );
  }
  if (!pkg.scripts?.build) violations.push(`${rel}: missing "scripts.build"`);

  if (!pkg.repository || typeof pkg.repository !== 'object') {
    violations.push(`${rel}: missing object-form "repository"`);
  } else {
    if (pkg.repository.type !== 'git') {
      violations.push(`${rel}: repository.type must be "git"`);
    }
    if (pkg.repository.url !== EXPECTED_REPOSITORY_URL) {
      violations.push(
        `${rel}: repository.url must be ${EXPECTED_REPOSITORY_URL}`,
      );
    }
    if (pkg.repository.directory !== packageRel) {
      violations.push(`${rel}: repository.directory must be ${packageRel}`);
    }
  }

  if (pkg.publishConfig?.access !== 'public') {
    violations.push(`${rel}: publishConfig.access must be "public"`);
  }
  if (pkg.publishConfig?.registry !== 'https://registry.npmjs.org/') {
    violations.push(
      `${rel}: publishConfig.registry must be https://registry.npmjs.org/`,
    );
  }

  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    violations.push(`${rel}: missing/empty "files"`);
    return;
  }

  for (const entry of pkg.files) {
    if (typeof entry !== 'string' || entry.length === 0) {
      violations.push(`${rel}: "files" entries must be non-empty strings`);
      continue;
    }
    if (
      isSrcPath(entry) &&
      !sourceEntryContainsOnlyAssets(dir, entry.replace(/^\.\//, ''))
    ) {
      violations.push(
        `${rel}: "files" includes source code instead of build output (${entry})`,
      );
    }
  }

  const publishedTargets = [
    ...(pkg.main ? [pkg.main] : []),
    ...(pkg.module ? [pkg.module] : []),
    ...(pkg.types ? [pkg.types] : []),
    ...collectStringValues(pkg.exports),
    ...collectStringValues(pkg.bin),
  ];

  for (const target of publishedTargets) {
    if (isSrcPath(target) && !isAllowedSourceAsset(target)) {
      violations.push(
        `${rel}: published entry points to source code (${target})`,
      );
    }
    if (!isPublishedByFiles(target, pkg.files)) {
      violations.push(
        `${rel}: published entry is excluded by "files" (${target})`,
      );
    }
  }

  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    for (const [name, version] of Object.entries(pkg[field] ?? {})) {
      if (typeof version !== 'string') continue;
      if (/^(file|link):/.test(version)) {
        violations.push(
          `${rel}: ${field}.${name} uses non-publishable specifier (${version})`,
        );
      }
      if (!version.startsWith('workspace:')) continue;

      const dependency = packageByName.get(name);
      if (!dependency) {
        violations.push(
          `${rel}: ${field}.${name} references a missing workspace package`,
        );
      } else if (
        dependency.pkg.private === true ||
        !dependency.pkg.publishConfig
      ) {
        violations.push(
          `${rel}: ${field}.${name} references private workspace package ${dependency.rel}`,
        );
      }
    }
  }
}

export function checkPublicPackageManifests({
  root = process.cwd(),
  requestedDirs = [],
} = {}) {
  const packagesRoot = path.join(root, 'packages');
  const allPackageDirs = fs
    .readdirSync(packagesRoot)
    .map((entry) => path.join(packagesRoot, entry))
    .filter(
      (dir) =>
        fs.existsSync(path.join(dir, 'package.json')) &&
        fs.statSync(dir).isDirectory(),
    );
  const packageDirs =
    requestedDirs.length > 0
      ? requestedDirs.map((dir) => path.resolve(root, dir))
      : allPackageDirs;
  const violations = [];
  const packageByName = new Map();
  let publicChecked = 0;

  for (const dir of allPackageDirs) {
    const packageJsonPath = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageByName.set(pkg.name, {
      pkg,
      rel: path.relative(root, packageJsonPath),
    });
  }

  for (const dir of packageDirs) {
    const packageJsonPath = path.join(dir, 'package.json');
    if (!isPathInside(packagesRoot, dir) || !fs.existsSync(packageJsonPath)) {
      violations.push(
        `${path.relative(root, dir)}: expected a package directory under packages/`,
      );
      continue;
    }

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const rel = path.relative(root, packageJsonPath);
    const isPublic = pkg.private !== true && Boolean(pkg.publishConfig);

    if (!isPublic) {
      if (pkg.private !== true) {
        violations.push(
          `${rel}: package must declare "private": true or a public publishConfig`,
        );
      }
      continue;
    }

    publicChecked += 1;
    validatePublicPackage({ dir, pkg, packageByName, root, violations });
  }

  return { checked: publicChecked, violations };
}

function runCli() {
  const result = checkPublicPackageManifests({
    requestedDirs: process.argv.slice(2),
  });

  if (result.violations.length > 0) {
    console.error('Public package policy violations found:\n');
    for (const violation of result.violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Public package policy check passed for ${result.checked} package directories.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
