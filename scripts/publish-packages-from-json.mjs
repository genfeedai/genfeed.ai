#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixEsmRelativeImports } from './fix-esm-relative-imports.mjs';

const RUNTIME_DEPENDENCY_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
];
const LOCAL_PROTOCOL = /^(?:file|link|workspace):/;
const RELEASE_COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
const BUILTIN_MODULES = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

class ReleaseError extends Error {}

function fail(message) {
  throw new ReleaseError(message);
}

function run(command, args, options = {}) {
  const {
    capture = false,
    cwd = process.cwd(),
    env,
    ...spawnOptions
  } = options;
  const result = spawnSync(command, args, {
    cwd,
    encoding: capture ? 'utf8' : undefined,
    env: { ...process.env, ...(env ?? {}) },
    stdio: capture ? 'pipe' : 'inherit',
    timeout: RELEASE_COMMAND_TIMEOUT_MS,
    ...spawnOptions,
  });

  if (result.status !== 0) {
    if (result.error?.code === 'ETIMEDOUT') {
      fail(
        `${command} ${args.join(' ')} timed out after ${RELEASE_COMMAND_TIMEOUT_MS}ms`,
      );
    }
    const detail = capture
      ? `\n${[result.stdout, result.stderr].filter(Boolean).join('\n').trim()}`
      : '';
    fail(`${command} ${args.join(' ')} failed${detail}`);
  }

  return capture ? result.stdout.trim() : '';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function directPackageDirectories(root) {
  const packagesRoot = path.join(root, 'packages');
  return fs
    .readdirSync(packagesRoot)
    .map((entry) => path.join(packagesRoot, entry))
    .filter(
      (dir) =>
        fs.lstatSync(dir).isDirectory() &&
        !fs.lstatSync(dir).isSymbolicLink() &&
        fs.existsSync(path.join(dir, 'package.json')),
    );
}

export function readPackageInventory(root) {
  const packages = directPackageDirectories(root).map((packageDir) => {
    const manifestPath = path.join(packageDir, 'package.json');
    return {
      manifestPath,
      packageDir,
      path: path.relative(root, packageDir).split(path.sep).join('/'),
      pkg: readJson(manifestPath),
    };
  });

  return {
    byName: new Map(packages.map((entry) => [entry.pkg.name, entry])),
    byPath: new Map(packages.map((entry) => [entry.path, entry])),
    packages,
  };
}

export function normalizeReleaseRequests(requests, inventory) {
  if (!Array.isArray(requests) || requests.length === 0) {
    fail('--packages-json must be a non-empty array');
  }

  const seenPaths = new Set();
  return requests.map((request, index) => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      fail(`packages_json[${index}] must be an object`);
    }
    if ('bump' in request) {
      fail(
        `packages_json[${index}].bump is not allowed; version changes must merge through a PR before publication`,
      );
    }

    const requestPath =
      typeof request.path === 'string' ? request.path.trim() : '';
    const expectedVersion =
      typeof request.version === 'string' ? request.version.trim() : '';
    if (!requestPath) fail(`packages_json[${index}].path is required`);
    if (!expectedVersion) {
      fail(`packages_json[${index}].version is required`);
    }

    const entry = inventory.byPath.get(requestPath);
    if (!entry) {
      fail(`${requestPath} must be a direct package directory under packages/`);
    }
    if (seenPaths.has(requestPath)) {
      fail(`Duplicate package path in request: ${requestPath}`);
    }
    seenPaths.add(requestPath);

    if (entry.pkg.private === true || !entry.pkg.publishConfig) {
      fail(`${requestPath} is private and cannot be published`);
    }
    if (entry.pkg.version !== expectedVersion) {
      fail(
        `${requestPath} expected version ${expectedVersion}, but master contains ${entry.pkg.version}`,
      );
    }

    return {
      ...entry,
      name: entry.pkg.name,
      version: entry.pkg.version,
    };
  });
}

function workspaceRuntimeDependencies(entry, inventory) {
  const dependencies = [];
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    for (const [name, specifier] of Object.entries(entry.pkg[field] ?? {})) {
      if (
        typeof specifier !== 'string' ||
        !specifier.startsWith('workspace:')
      ) {
        continue;
      }
      const target = inventory.byName.get(name);
      if (!target)
        fail(`${entry.path} references missing workspace package ${name}`);
      if (target.pkg.private === true || !target.pkg.publishConfig) {
        fail(`${entry.path} references private workspace package ${name}`);
      }
      dependencies.push({ field, name, target });
    }
  }
  return dependencies;
}

export function sortReleaseRequests(requests, inventory) {
  const selectedByName = new Map(requests.map((entry) => [entry.name, entry]));
  const dependenciesByName = new Map();
  const dependentsByName = new Map(requests.map((entry) => [entry.name, []]));
  const indegree = new Map(requests.map((entry) => [entry.name, 0]));

  for (const entry of requests) {
    const selectedDependencies = workspaceRuntimeDependencies(entry, inventory)
      .map(({ target }) => target.pkg.name)
      .filter((name) => selectedByName.has(name));
    dependenciesByName.set(entry.name, selectedDependencies);
    indegree.set(entry.name, selectedDependencies.length);
    for (const dependencyName of selectedDependencies) {
      dependentsByName.get(dependencyName).push(entry.name);
    }
  }

  const ready = requests
    .filter((entry) => indegree.get(entry.name) === 0)
    .map((entry) => entry.name)
    .sort();
  const ordered = [];

  while (ready.length > 0) {
    const name = ready.shift();
    ordered.push(selectedByName.get(name));
    for (const dependentName of dependentsByName.get(name).sort()) {
      const nextIndegree = indegree.get(dependentName) - 1;
      indegree.set(dependentName, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(dependentName);
        ready.sort();
      }
    }
  }

  if (ordered.length !== requests.length) {
    const cyclePackages = requests
      .map((entry) => entry.name)
      .filter((name) => indegree.get(name) > 0)
      .sort();
    fail(
      `Selected packages contain a dependency cycle: ${cyclePackages.join(', ')}`,
    );
  }

  return ordered.map((entry) => ({
    ...entry,
    selectedDependencies: dependenciesByName.get(entry.name),
  }));
}

function npmView(packageSpec) {
  const result = spawnSync('npm', ['view', packageSpec, '--json'], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: RELEASE_COMMAND_TIMEOUT_MS,
  });
  if (result.status === 0) return JSON.parse(result.stdout || 'null');
  if (result.error?.code === 'ETIMEDOUT') {
    fail(
      `npm view ${packageSpec} timed out after ${RELEASE_COMMAND_TIMEOUT_MS}ms`,
    );
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (/E404|No match found|Not Found/i.test(output)) return null;
  fail(`npm view ${packageSpec} failed\n${output.trim()}`);
}

function assertRegistryDependencyClosure(ordered, inventory) {
  const selectedNames = new Set(ordered.map((entry) => entry.name));
  const checked = new Set();

  for (const entry of ordered) {
    for (const { name, target } of workspaceRuntimeDependencies(
      entry,
      inventory,
    )) {
      if (selectedNames.has(name)) continue;
      const packageSpec = `${name}@${target.pkg.version}`;
      if (checked.has(packageSpec)) continue;
      checked.add(packageSpec);
      if (!npmView(packageSpec)) {
        fail(
          `${entry.name} requires unpublished ${packageSpec}; include ${target.path} in this release`,
        );
      }
    }
  }
}

function collectStringValues(value, values = []) {
  if (typeof value === 'string') {
    values.push(value);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value))
      collectStringValues(child, values);
  }
  return values;
}

function globTargetMatches(target, archiveFiles) {
  const normalized = `package/${target.replace(/^\.\//, '')}`;
  const expression = new RegExp(
    `^${normalized
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '[^/]+')}$`,
  );
  return archiveFiles.some((file) => expression.test(file));
}

export function validatePackedPackage({
  archiveFiles,
  inventory,
  packedManifest,
  request,
}) {
  const violations = [];
  if (packedManifest.name !== request.name) {
    violations.push(`packed name is ${packedManifest.name}`);
  }
  if (packedManifest.version !== request.version) {
    violations.push(`packed version is ${packedManifest.version}`);
  }
  if (packedManifest.license !== request.pkg.license) {
    violations.push(`packed license is ${packedManifest.license}`);
  }
  if (
    JSON.stringify(packedManifest.repository) !==
    JSON.stringify(request.pkg.repository)
  ) {
    violations.push('packed repository metadata differs from the source');
  }
  if (!archiveFiles.includes('package/LICENSE')) {
    violations.push('tarball is missing LICENSE');
  }

  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    for (const [name, specifier] of Object.entries(
      packedManifest[field] ?? {},
    )) {
      if (typeof specifier === 'string' && LOCAL_PROTOCOL.test(specifier)) {
        violations.push(`${field}.${name} retained ${specifier}`);
      }

      const sourceSpecifier = request.pkg[field]?.[name];
      if (sourceSpecifier?.startsWith('workspace:')) {
        const workspacePackage = inventory.byName.get(name);
        if (specifier !== workspacePackage?.pkg.version) {
          violations.push(
            `${field}.${name} resolved to ${specifier}, expected ${workspacePackage?.pkg.version}`,
          );
        }
      }
    }
  }

  const targets = [
    ...(packedManifest.main ? [packedManifest.main] : []),
    ...(packedManifest.module ? [packedManifest.module] : []),
    ...(packedManifest.types ? [packedManifest.types] : []),
    ...collectStringValues(packedManifest.exports),
    ...collectStringValues(packedManifest.bin),
  ];
  for (const target of targets) {
    if (!globTargetMatches(target, archiveFiles)) {
      violations.push(`published target is missing from tarball: ${target}`);
    }
  }

  for (const archiveFile of archiveFiles) {
    if (
      archiveFile.split('/').some((segment) => segment.startsWith('._')) ||
      archiveFile.includes('__MACOSX')
    ) {
      violations.push(`tarball includes macOS metadata: ${archiveFile}`);
    }
    if (
      /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(archiveFile) ||
      (/\.[cm]?tsx?$/.test(archiveFile) && !/\.d\.[cm]?ts$/.test(archiveFile))
    ) {
      violations.push(`tarball includes source/test code: ${archiveFile}`);
    }
  }

  if (violations.length > 0) {
    fail(
      `${request.name}@${request.version} tarball is invalid:\n- ${violations.join('\n- ')}`,
    );
  }
}

function archiveIntegrity(tarballPath) {
  const bytes = fs.readFileSync(tarballPath);
  return `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;
}

function archiveContentDigest(tarballPath) {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-content-'));
  try {
    run('tar', ['-xzf', tarballPath, '-C', extractDir]);
    const packageRoot = path.join(extractDir, 'package');
    const files = [];
    const stack = [packageRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolutePath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(absolutePath);
        else files.push(absolutePath);
      }
    }

    const hash = crypto.createHash('sha256');
    for (const filePath of files.sort()) {
      hash.update(
        path.relative(packageRoot, filePath).split(path.sep).join('/'),
      );
      hash.update('\0');
      hash.update(fs.readFileSync(filePath));
      hash.update('\0');
    }
    return `sha256-${hash.digest('hex')}`;
  } finally {
    fs.rmSync(extractDir, { force: true, recursive: true });
  }
}

function dependencyNameFromSpecifier(specifier) {
  if (specifier.startsWith('@'))
    return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

function validatePackedImports(tarballPath, packedManifest) {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-imports-'));
  try {
    run('tar', ['-xzf', tarballPath, '-C', extractDir]);
    const packageRoot = path.join(extractDir, 'package');
    const declaredDependencies = new Set(
      RUNTIME_DEPENDENCY_FIELDS.flatMap((field) =>
        Object.keys(packedManifest[field] ?? {}),
      ),
    );
    const files = [];
    const stack = [packageRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolutePath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(absolutePath);
        else if (/\.(?:[cm]?js|d\.[cm]?ts)$/.test(entry.name)) {
          files.push(absolutePath);
        }
      }
    }

    const missing = new Set();
    const importPattern =
      /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\()\s*['"]([^'"]+)['"]/g;
    for (const filePath of files) {
      const source = fs.readFileSync(filePath, 'utf8');
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1];
        if (specifier?.startsWith('.')) {
          if (
            /\.[cm]?js$/.test(filePath) &&
            !fs.existsSync(path.resolve(path.dirname(filePath), specifier))
          ) {
            missing.add(
              `${specifier} (${path.relative(packageRoot, filePath)} has a non-resolvable relative import)`,
            );
          }
          continue;
        }
        if (
          !specifier ||
          specifier.startsWith('/') ||
          BUILTIN_MODULES.has(specifier)
        ) {
          continue;
        }
        const dependencyName = dependencyNameFromSpecifier(specifier);
        if (
          dependencyName !== packedManifest.name &&
          !declaredDependencies.has(dependencyName)
        ) {
          missing.add(
            `${dependencyName} (${path.relative(packageRoot, filePath)})`,
          );
        }
      }
    }

    if (missing.size > 0) {
      fail(
        `${packedManifest.name}@${packedManifest.version} has undeclared packed imports:\n- ${Array.from(missing).sort().join('\n- ')}`,
      );
    }
  } finally {
    fs.rmSync(extractDir, { force: true, recursive: true });
  }
}

function packRegistryVersion(packageSpec) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-package-'));
  try {
    const result = spawnSync(
      'npm',
      [
        'pack',
        packageSpec,
        '--ignore-scripts',
        '--pack-destination',
        tempDir,
        '--silent',
      ],
      {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: RELEASE_COMMAND_TIMEOUT_MS,
      },
    );
    if (result.status !== 0) {
      if (result.error?.code === 'ETIMEDOUT') {
        fail(
          `npm pack ${packageSpec} timed out after ${RELEASE_COMMAND_TIMEOUT_MS}ms`,
        );
      }
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      if (/E404|No match found|Not Found/i.test(output)) return null;
      fail(`npm pack ${packageSpec} failed\n${output.trim()}`);
    }
    const tarball = fs
      .readdirSync(tempDir)
      .find((fileName) => fileName.endsWith('.tgz'));
    if (!tarball) fail(`npm pack ${packageSpec} produced no tarball`);
    return archiveContentDigest(path.join(tempDir, tarball));
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

export function registryAction(expectedDigest, registryDigest) {
  if (registryDigest === null) return 'publish';
  if (registryDigest === expectedDigest) return 'skip';
  fail('registry version exists with content that does not match the plan');
}

function waitForRegistryContent(packageSpec, expectedDigest) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    if (npmView(packageSpec)) {
      const registryDigest = packRegistryVersion(packageSpec);
      if (registryDigest === expectedDigest) return;
      if (registryDigest !== null) {
        fail(`${packageSpec} reached npm with unexpected tarball content`);
      }
    }
    if (attempt < 10) run('sleep', ['3']);
  }
  fail(`${packageSpec} was not readable from npm after publication`);
}

export function assertCleanWorkingTree(root) {
  const status = run(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { capture: true, cwd: root },
  );
  if (status) {
    fail(
      `package release requires a clean working tree, including untracked files:\n${status}`,
    );
  }
}

function assertMasterPublication(root, sourceSha) {
  assertCleanWorkingTree(root);
  const headSha = run('git', ['rev-parse', 'HEAD'], {
    capture: true,
    cwd: root,
  });
  if (headSha !== sourceSha) {
    fail(
      `release plan was built from ${sourceSha}, but checkout is ${headSha}`,
    );
  }

  const masterRef = run(
    'git',
    ['ls-remote', '--exit-code', 'origin', 'refs/heads/master'],
    {
      capture: true,
      cwd: root,
    },
  );
  const masterSha = masterRef.split(/\s+/)[0];
  if (!masterSha) {
    fail('could not resolve the current origin/master commit');
  }
  if (headSha !== masterSha) {
    fail(
      `real package publication requires current origin/master (${masterSha}); checkout is ${headSha}`,
    );
  }
}

function tarballName(request) {
  return `${request.name.replace(/^@/, '').replace('/', '-')}-${request.version}.tgz`;
}

function licenseSourcePath(root, request) {
  const packageLicense = path.join(request.packageDir, 'LICENSE');
  let licensePath;
  if (fs.existsSync(packageLicense)) {
    licensePath = packageLicense;
  } else if (request.pkg.license === 'MIT') {
    licensePath = path.join(root, 'LICENSES', 'MIT.txt');
  } else if (
    request.pkg.license === 'AGPL-3.0' ||
    request.pkg.license === 'AGPL-3.0-or-later'
  ) {
    licensePath = path.join(root, 'LICENSE');
  } else {
    fail(`${request.name} uses unsupported license ${request.pkg.license}`);
  }

  if (!fs.existsSync(licensePath)) {
    fail(`${request.name} license text is missing: ${licensePath}`);
  }
  const licenseText = fs.readFileSync(licensePath, 'utf8');
  if (
    request.pkg.license === 'MIT' &&
    (!licenseText.includes('MIT License') ||
      !licenseText.includes('Permission is hereby granted'))
  ) {
    fail(`${request.name} MIT license text is incomplete`);
  }
  if (
    request.pkg.license.startsWith('AGPL-3.0') &&
    (!licenseText.includes('GNU AFFERO GENERAL PUBLIC LICENSE') ||
      !licenseText.includes('END OF TERMS AND CONDITIONS') ||
      !licenseText.includes('How to Apply These Terms to Your New Programs'))
  ) {
    fail(
      `${request.name} requires the complete GNU AGPL v3 text in the root LICENSE`,
    );
  }
  return licensePath;
}

function injectLicenseIntoTarball({ licensePath, tarballPath }) {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-license-'));
  try {
    run('tar', ['-xzf', tarballPath, '-C', extractDir]);
    const packageRoot = path.join(extractDir, 'package');
    if (!fs.existsSync(path.join(packageRoot, 'package.json'))) {
      fail(`${tarballPath} has no package root`);
    }
    fs.copyFileSync(licensePath, path.join(packageRoot, 'LICENSE'));
    fs.rmSync(tarballPath, { force: true });
    run('tar', ['-czf', tarballPath, '-C', extractDir, 'package'], {
      env: { COPYFILE_DISABLE: '1' },
    });
  } finally {
    fs.rmSync(extractDir, { force: true, recursive: true });
  }
}

// Published tarballs must resolve under strict Node ESM, but workspace
// packages compile with moduleResolution "bundler": extensionless relative
// imports and internal tsconfig path aliases that plain `node` cannot load.
// Rewrite the freshly built output here — publish time is the ONLY place a
// Node-strict dist is needed (every in-repo consumer is a bundler or Bun) —
// rather than in each package's `build` script, which forced every build
// environment (Docker included) to carry the repo-root rewrite script.
// validatePackedImports() fails the release if this rewrite ever regresses.
export function rewriteDistForNodeResolution(packageDir) {
  const distDir = path.join(packageDir, 'dist');
  if (!fs.existsSync(distDir)) return null;
  const projectPath = path.join(packageDir, 'tsconfig.json');
  return fixEsmRelativeImports(
    [distDir],
    fs.existsSync(projectPath) ? { projectPath } : {},
  );
}

function preparePackage({ artifactsDir, inventory, request, root }) {
  if (request.pkg.scripts?.clean) {
    run('bun', ['run', 'clean'], { cwd: request.packageDir });
  } else {
    fs.rmSync(path.join(request.packageDir, 'dist'), {
      force: true,
      recursive: true,
    });
    for (const entry of fs.readdirSync(request.packageDir)) {
      if (entry.endsWith('.tsbuildinfo')) {
        fs.rmSync(path.join(request.packageDir, entry), { force: true });
      }
    }
  }
  run('bun', ['run', 'build'], { cwd: request.packageDir });
  rewriteDistForNodeResolution(request.packageDir);

  const fileName = tarballName(request);
  const tarballPath = path.join(artifactsDir, fileName);
  const existingTarballs = new Set(fs.readdirSync(artifactsDir));
  run(
    'bun',
    ['pm', 'pack', '--ignore-scripts', '--destination', artifactsDir],
    { cwd: request.packageDir },
  );
  const packedFileName = fs
    .readdirSync(artifactsDir)
    .find((entry) => entry.endsWith('.tgz') && !existingTarballs.has(entry));
  if (!packedFileName) fail(`${request.name} produced no tarball`);
  const packedPath = path.join(artifactsDir, packedFileName);
  if (packedPath !== tarballPath) fs.renameSync(packedPath, tarballPath);
  injectLicenseIntoTarball({
    licensePath: licenseSourcePath(root, request),
    tarballPath,
  });

  const packedManifest = JSON.parse(
    run('tar', ['-xOzf', tarballPath, 'package/package.json'], {
      capture: true,
    }),
  );
  const archiveFiles = run('tar', ['-tzf', tarballPath], { capture: true })
    .split('\n')
    .filter(Boolean);
  validatePackedPackage({
    archiveFiles,
    inventory,
    packedManifest,
    request,
  });
  validatePackedImports(tarballPath, packedManifest);

  const contentDigest = archiveContentDigest(tarballPath);
  const existing = npmView(`${request.name}@${request.version}`);
  if (existing) {
    const registryDigest = packRegistryVersion(
      `${request.name}@${request.version}`,
    );
    if (registryDigest === null) {
      fail(
        `${request.name}@${request.version} exists but its tarball is unavailable`,
      );
    }
    try {
      registryAction(contentDigest, registryDigest);
    } catch {
      fail(
        `${request.name}@${request.version} already exists with different tarball content; bump the version through a PR`,
      );
    }
  } else {
    run('npm', [
      'publish',
      tarballPath,
      '--access',
      'public',
      '--dry-run',
      '--ignore-scripts',
    ]);
  }

  return {
    contentDigest,
    integrity: archiveIntegrity(tarballPath),
    name: request.name,
    path: request.path,
    registryStatus: existing ? 'already-published' : 'pending',
    selectedDependencies: request.selectedDependencies,
    tarball: fileName,
    version: request.version,
  };
}

export function prepareRelease({ outputDir, packagesJson, root }) {
  assertCleanWorkingTree(root);
  const inventory = readPackageInventory(root);
  let requests;
  try {
    requests = JSON.parse(packagesJson);
  } catch (error) {
    fail(`Failed to parse --packages-json: ${error.message}`);
  }

  const normalized = normalizeReleaseRequests(requests, inventory);
  const ordered = sortReleaseRequests(normalized, inventory);
  run('node', [
    path.join(root, 'scripts', 'check-public-package-manifests.mjs'),
    ...ordered.map((entry) => entry.path),
  ]);
  assertRegistryDependencyClosure(ordered, inventory);

  fs.rmSync(outputDir, { force: true, recursive: true });
  const artifactsDir = path.join(outputDir, 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  const packages = ordered.map((request) =>
    preparePackage({ artifactsDir, inventory, request, root }),
  );
  const sourceSha = run('git', ['rev-parse', 'HEAD'], {
    capture: true,
    cwd: root,
  });
  const plan = {
    createdAt: new Date().toISOString(),
    packages,
    schemaVersion: 1,
    sourceSha,
  };
  writeJson(path.join(outputDir, 'release-plan.json'), plan);
  writeJson(path.join(outputDir, 'release-status.json'), {
    mode: 'dry-run',
    packages: packages.map(({ name, registryStatus, version }) => ({
      name,
      status: registryStatus,
      version,
    })),
    sourceSha,
  });
  assertCleanWorkingTree(root);
  return plan;
}

export function publishReleasePlan({ planPath, root }) {
  const plan = readJson(planPath);
  assertMasterPublication(root, plan.sourceSha);
  const outputDir = path.dirname(planPath);
  const statuses = plan.packages.map((release) => ({
    ...release,
    status: 'pending',
  }));
  const writeStatus = () =>
    writeJson(path.join(outputDir, 'release-status.json'), {
      mode: 'publish',
      packages: statuses,
      sourceSha: plan.sourceSha,
    });
  writeStatus();

  for (const [index, release] of plan.packages.entries()) {
    const packageSpec = `${release.name}@${release.version}`;
    const existing = npmView(packageSpec);
    if (existing) {
      const registryDigest = packRegistryVersion(packageSpec);
      if (registryDigest === null) {
        fail(`${packageSpec} exists but its tarball is unavailable`);
      }
      registryAction(release.contentDigest, registryDigest);
      statuses[index] = { ...release, status: 'already-published' };
    } else {
      const tarballPath = path.join(outputDir, 'artifacts', release.tarball);
      if (archiveIntegrity(tarballPath) !== release.integrity) {
        fail(`${release.tarball} integrity does not match the release plan`);
      }
      run('npm', [
        'publish',
        tarballPath,
        '--access',
        'public',
        '--provenance',
        '--ignore-scripts',
      ]);
      waitForRegistryContent(packageSpec, release.contentDigest);
      statuses[index] = { ...release, status: 'published' };
    }
    writeStatus();
  }

  return statuses;
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  return index === -1 ? null : (args[index + 1] ?? null);
}

function runCli() {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const packagesJson = optionValue(args, '--packages-json');
  const outputDirArg = optionValue(args, '--output-dir');
  const publishPlanArg = optionValue(args, '--publish-plan');

  if (publishPlanArg) {
    const statuses = publishReleasePlan({
      planPath: path.resolve(root, publishPlanArg),
      root,
    });
    console.log('\nPublication complete:');
    for (const release of statuses) {
      console.log(`- ${release.name}@${release.version}: ${release.status}`);
    }
    return;
  }

  if (!packagesJson) {
    fail(
      "Usage: node scripts/publish-packages-from-json.mjs --packages-json '<json>' --output-dir <dir> | --publish-plan <plan.json>",
    );
  }
  const outputDir = path.resolve(root, outputDirArg ?? '.package-release');
  const plan = prepareRelease({
    outputDir,
    packagesJson,
    root,
  });
  console.log('\nDry-run release plan:');
  for (const release of plan.packages) {
    console.log(
      `- ${release.name}@${release.version}: ${release.registryStatus} (${release.integrity})`,
    );
  }
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
