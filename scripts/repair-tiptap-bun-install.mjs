import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const bunRoot = path.join(repoRoot, 'node_modules', '.bun');
const tiptapRoot = path.join(repoRoot, 'node_modules', '@tiptap');

if (!fs.existsSync(bunRoot)) {
  console.log('No Bun install cache found; skipping TipTap repair.');
  process.exit(0);
}

/**
 * Bun 1.3.10 can leave TipTap partially installed:
 * - only direct @tiptap dependencies are symlinked into node_modules/@tiptap
 * - many packages ship only TypeScript source and missing dist/ export targets
 *
 * Next 16 + Turbopack expects the exported runtime files to exist. Repair the
 * Bun install in-place so all required @tiptap packages and export entrypoints
 * resolve consistently during web builds.
 */

function compareVersions(left, right) {
  const leftParts = left
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

function listFilesRecursive(directoryPath) {
  const files = [];

  for (const entry of fs.readdirSync(directoryPath)) {
    const entryPath = path.join(directoryPath, entry);
    const stats = fs.statSync(entryPath);

    if (stats.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

function findBuiltJavaScript(tempRoot) {
  return (
    listFilesRecursive(tempRoot).find((entryPath) =>
      entryPath.endsWith('.js'),
    ) ?? null
  );
}

function normalizeExportTarget(exportTarget, field) {
  if (typeof exportTarget === 'string') {
    return exportTarget;
  }

  if (!exportTarget || typeof exportTarget !== 'object') {
    return null;
  }

  const selectedTarget = exportTarget[field];

  if (typeof selectedTarget === 'string') {
    return selectedTarget;
  }

  return null;
}

function normalizeTypesTarget(exportTarget, field) {
  if (!exportTarget || typeof exportTarget !== 'object') {
    return null;
  }

  const typesTarget = exportTarget.types;

  if (typeof typesTarget === 'string' && field === 'import') {
    return typesTarget;
  }

  if (
    typesTarget &&
    typeof typesTarget === 'object' &&
    typeof typesTarget[field] === 'string'
  ) {
    return typesTarget[field];
  }

  return null;
}

function writeRelativeExport(outputPath, targetPath) {
  ensureDirectory(outputPath);

  const relativeTargetPath = path
    .relative(path.dirname(outputPath), targetPath)
    .replaceAll(path.sep, '/');
  const normalizedTargetPath = relativeTargetPath.startsWith('.')
    ? relativeTargetPath
    : `./${relativeTargetPath}`;

  fs.writeFileSync(outputPath, `export * from '${normalizedTargetPath}';\n`);
}

function writeRelativeRequire(outputPath, targetPath) {
  ensureDirectory(outputPath);

  const relativeTargetPath = path
    .relative(path.dirname(outputPath), targetPath)
    .replaceAll(path.sep, '/');
  const normalizedTargetPath = relativeTargetPath.startsWith('.')
    ? relativeTargetPath
    : `./${relativeTargetPath}`;

  fs.writeFileSync(
    outputPath,
    `module.exports = require('${normalizedTargetPath}')\n`,
  );
}

function sourceHasDefaultExport(sourceEntry) {
  const sourceText = fs.readFileSync(sourceEntry, 'utf8');

  return (
    /export\s+default\b/.test(sourceText) ||
    /export\s*{\s*[^}]*\bdefault\b[^}]*}/.test(sourceText)
  );
}

function writeTypesReExport(outputPath, sourceEntry) {
  ensureDirectory(outputPath);

  const relativeSourcePath = path
    .relative(path.dirname(outputPath), sourceEntry)
    .replaceAll(path.sep, '/');
  const normalizedSourcePath = relativeSourcePath.startsWith('.')
    ? relativeSourcePath
    : `./${relativeSourcePath}`;
  const lines = [`export * from '${normalizedSourcePath}';`];

  if (sourceHasDefaultExport(sourceEntry)) {
    lines.push(`export { default } from '${normalizedSourcePath}';`);
  }

  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
}

function getSourceCandidates(exportPath) {
  if (exportPath === '.') {
    return [
      path.join('src', 'index.ts'),
      path.join('src', 'index.tsx'),
      'index.ts',
      'index.tsx',
    ];
  }

  const exportKey = exportPath.replace(/^\.\//, '');

  return [
    path.join(exportKey, 'index.ts'),
    path.join(exportKey, 'index.tsx'),
    `${exportKey}.ts`,
    `${exportKey}.tsx`,
    path.join('src', exportKey, 'index.ts'),
    path.join('src', exportKey, 'index.tsx'),
    path.join('src', `${exportKey}.ts`),
    path.join('src', `${exportKey}.tsx`),
  ];
}

function findSourceEntry(realPackageRoot, exportPath) {
  for (const candidate of getSourceCandidates(exportPath)) {
    const candidatePath = path.join(realPackageRoot, candidate);

    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function buildExportEntry({
  exportPath,
  exportTarget,
  externalPackages,
  packageName,
  realPackageRoot,
  sourceEntry,
}) {
  const importTarget = normalizeExportTarget(exportTarget, 'import');
  const requireTarget = normalizeExportTarget(exportTarget, 'require');
  const importTypesTarget = normalizeTypesTarget(exportTarget, 'import');
  const requireTypesTarget = normalizeTypesTarget(exportTarget, 'require');

  if (!importTarget && !requireTarget) {
    return false;
  }

  const tempRoot = path.join(
    realPackageRoot,
    'dist',
    `.tmp-${exportPath === '.' ? 'root' : exportPath.replaceAll('/', '__')}`,
  );
  const tempEsmRoot = path.join(tempRoot, 'esm');
  const tempCjsRoot = path.join(tempRoot, 'cjs');

  fs.rmSync(tempRoot, { force: true, recursive: true });

  const builtFiles = [];

  if (importTarget) {
    const esmResult = await Bun.build({
      entrypoints: [sourceEntry],
      external: externalPackages,
      format: 'esm',
      minify: false,
      outdir: tempEsmRoot,
      packages: 'external',
      sourcemap: 'none',
      splitting: false,
      target: 'browser',
    });

    if (!esmResult.success) {
      throw new Error(
        `Failed to build ${packageName}${exportPath} (esm): ${esmResult.logs.map((log) => log.message).join('\n')}`,
      );
    }

    const builtImportFile = findBuiltJavaScript(tempEsmRoot);

    if (!builtImportFile) {
      throw new Error(
        `Expected ESM output missing for ${packageName}${exportPath}`,
      );
    }

    const importOutputPath = path.join(realPackageRoot, importTarget);
    ensureDirectory(importOutputPath);
    fs.copyFileSync(builtImportFile, importOutputPath);
    builtFiles.push(importOutputPath);
  }

  if (requireTarget) {
    const cjsResult = await Bun.build({
      entrypoints: [sourceEntry],
      external: externalPackages,
      format: 'cjs',
      minify: false,
      outdir: tempCjsRoot,
      packages: 'external',
      sourcemap: 'none',
      splitting: false,
      target: 'browser',
    });

    if (!cjsResult.success) {
      throw new Error(
        `Failed to build ${packageName}${exportPath} (cjs): ${cjsResult.logs.map((log) => log.message).join('\n')}`,
      );
    }

    const builtRequireFile = findBuiltJavaScript(tempCjsRoot);

    if (!builtRequireFile) {
      throw new Error(
        `Expected CJS output missing for ${packageName}${exportPath}`,
      );
    }

    const requireOutputPath = path.join(realPackageRoot, requireTarget);
    ensureDirectory(requireOutputPath);
    fs.copyFileSync(builtRequireFile, requireOutputPath);
    builtFiles.push(requireOutputPath);
  }

  for (const typesTarget of [importTypesTarget, requireTypesTarget]) {
    if (!typesTarget) {
      continue;
    }

    const typesOutputPath = path.join(realPackageRoot, typesTarget);
    writeTypesReExport(typesOutputPath, sourceEntry);
    builtFiles.push(typesOutputPath);
  }

  fs.rmSync(tempRoot, { force: true, recursive: true });

  return builtFiles.length > 0;
}

function repairProxyExport({
  exportTarget,
  exportPath,
  packageJson,
  realPackageRoot,
}) {
  if (
    packageJson.name !== '@tiptap/core' ||
    exportPath !== './jsx-dev-runtime'
  ) {
    return false;
  }

  const importTarget = normalizeExportTarget(exportTarget, 'import');
  const requireTarget = normalizeExportTarget(exportTarget, 'require');
  const importTypesTarget = normalizeTypesTarget(exportTarget, 'import');
  const requireTypesTarget = normalizeTypesTarget(exportTarget, 'require');
  const runtimeImportTarget = path.join(
    realPackageRoot,
    'jsx-runtime',
    'index.js',
  );
  const runtimeRequireTarget = path.join(
    realPackageRoot,
    'jsx-runtime',
    'index.cjs',
  );
  const runtimeTypesTarget = path.join(
    realPackageRoot,
    'jsx-runtime',
    'index.d.ts',
  );
  const runtimeRequireTypesTarget = path.join(
    realPackageRoot,
    'jsx-runtime',
    'index.d.cts',
  );

  if (importTarget) {
    writeRelativeExport(
      path.join(realPackageRoot, importTarget),
      runtimeImportTarget,
    );
  }

  if (requireTarget) {
    writeRelativeRequire(
      path.join(realPackageRoot, requireTarget),
      runtimeRequireTarget,
    );
  }

  if (importTypesTarget) {
    writeRelativeExport(
      path.join(realPackageRoot, importTypesTarget),
      runtimeTypesTarget,
    );
  }

  if (requireTypesTarget) {
    writeRelativeExport(
      path.join(realPackageRoot, requireTypesTarget),
      runtimeRequireTypesTarget,
    );
  }

  return true;
}

function getTiptapCachePackages() {
  const packagesByName = new Map();

  for (const entry of fs.readdirSync(bunRoot)) {
    if (!entry.startsWith('@tiptap+')) {
      continue;
    }

    const packageRoot = path.join(bunRoot, entry, 'node_modules', '@tiptap');

    if (!fs.existsSync(packageRoot)) {
      continue;
    }

    for (const packageDir of fs.readdirSync(packageRoot)) {
      const realPackageRoot = path.join(packageRoot, packageDir);
      const packageJsonPath = path.join(realPackageRoot, 'package.json');

      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const existing = packagesByName.get(packageJson.name);

      if (
        !existing ||
        compareVersions(
          packageJson.version ?? '0.0.0',
          existing.packageJson.version ?? '0.0.0',
        ) > 0
      ) {
        packagesByName.set(packageJson.name, {
          packageDir,
          packageJson,
          realPackageRoot,
        });
      }
    }
  }

  return packagesByName;
}

function ensureSymlink(targetPath, linkPath) {
  if (fs.existsSync(linkPath)) {
    return false;
  }

  ensureDirectory(linkPath);
  fs.symlinkSync(targetPath, linkPath, 'dir');
  return true;
}

async function repairPackage(packageInfo) {
  const { packageDir, packageJson, realPackageRoot } = packageInfo;
  const packageLinkPath = path.join(tiptapRoot, packageDir);
  const linked = ensureSymlink(realPackageRoot, packageLinkPath);
  const externalPackages = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ];

  const rebuiltExports = [];

  for (const [exportPath, exportTarget] of Object.entries(
    packageJson.exports ?? {},
  )) {
    const sourceEntry = findSourceEntry(realPackageRoot, exportPath);

    if (!sourceEntry) {
      if (
        repairProxyExport({
          exportTarget,
          exportPath,
          packageJson,
          realPackageRoot,
        })
      ) {
        rebuiltExports.push(exportPath);
      }

      continue;
    }

    const didBuild = await buildExportEntry({
      exportPath,
      exportTarget,
      externalPackages,
      packageName: packageJson.name,
      realPackageRoot,
      sourceEntry,
    });

    if (didBuild) {
      rebuiltExports.push(exportPath);
    }
  }

  return {
    linked,
    packageName: packageJson.name,
    rebuiltExports,
  };
}

fs.mkdirSync(tiptapRoot, { recursive: true });

const tiptapPackages = getTiptapCachePackages();
const repairResults = [];

for (const packageInfo of tiptapPackages.values()) {
  repairResults.push(await repairPackage(packageInfo));
}

const linkedPackages = repairResults
  .filter((result) => result.linked)
  .map((result) => result.packageName);
const rebuiltPackages = repairResults.filter(
  (result) => result.rebuiltExports.length > 0,
);

if (linkedPackages.length === 0 && rebuiltPackages.length === 0) {
  console.log('TipTap install already looks repaired; no changes needed.');
  process.exit(0);
}

if (linkedPackages.length > 0) {
  console.log(`Linked ${linkedPackages.length} missing TipTap package(s):`);
  for (const packageName of linkedPackages) {
    console.log(`- ${packageName}`);
  }
}

if (rebuiltPackages.length > 0) {
  console.log(
    `Rebuilt TipTap export entrypoints for ${rebuiltPackages.length} package(s):`,
  );
  for (const result of rebuiltPackages) {
    console.log(`- ${result.packageName}: ${result.rebuiltExports.join(', ')}`);
  }
}
