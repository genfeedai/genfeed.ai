import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const PACKAGES_ROOT = 'packages';
const CHANGES_ROOT = '.changes';
const PACKAGE_PREFIX = '@genfeedai/';

const IGNORED_PATH_SEGMENTS = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'storybook-static',
  'test-results',
]);

const FALLBACK_IGNORED_FILE_PATTERNS = [
  /\.config\.[cm]?[jt]sx?$/u,
  /\.stories\.[jt]sx?$/u,
  /\.story\.[jt]sx?$/u,
  /\.spec\.[jt]sx?$/u,
  /\.test\.[jt]sx?$/u,
  /^package\.json$/u,
  /^tsconfig(\..+)?\.json$/u,
  /^vitest\.config\.[cm]?[jt]s$/u,
];

type CliArgs = {
  allPackages: boolean;
  baseRef: string | null;
  isJson: boolean;
  writeSnapshot: string | null;
};

type PackageManifest = {
  exports?: Record<string, ExportTarget> | ExportTarget;
  name?: string;
  version?: string;
};

type ExportTarget =
  | string
  | {
      bun?: string;
      default?: string;
      import?: string;
      require?: string;
      types?: string;
    };

type PackageSnapshot = {
  packageDir: string;
  packageName: string;
  version: string | null;
  modules: ModuleSnapshot[];
};

type ModuleSnapshot = {
  filePath: string;
  hash: string;
  signature: string;
  specifier: string;
};

type PackageDiff = {
  baseVersion: string | null;
  changedModules: ChangedModule[];
  currentVersion: string | null;
  hasMigrationNote: boolean;
  hasVersionBump: boolean;
  packageDir: string;
  packageName: string;
};

type ChangedModule = {
  baseHash: string | null;
  currentHash: string | null;
  kind: 'added' | 'changed' | 'removed';
  specifier: string;
};

type RunReport = {
  comparedPackages: string[];
  currentPackageCount: number;
  diffs: PackageDiff[];
  failures: PackageDiff[];
  migrationNotePackages: string[];
};

type PackageTree = {
  files: string[];
  readFile(filePath: string): string | null;
};

type FileAccessor = {
  exists(filePath: string): boolean;
  listPackageFiles(packageDir: string): string[];
  readFile(filePath: string): string | null;
};

type SnapshotOptions = {
  packageDirs?: string[];
  rootDir?: string;
};

export function runCheckPackageApiSurface(
  options: SnapshotOptions & {
    baseRef?: string | null;
  } = {},
): RunReport {
  const rootDir = options.rootDir ?? process.cwd();
  const currentPackageDirs = discoverCurrentPackageDirs(rootDir);
  const packageDirs =
    options.packageDirs !== undefined
      ? [...options.packageDirs]
      : currentPackageDirs;
  const baseRef = options.baseRef ?? null;
  const currentAccessor = createDiskAccessor(rootDir);
  const currentSnapshots = buildSnapshotsForAccessor(
    packageDirs,
    currentAccessor,
  );
  const currentPackageCount = currentPackageDirs.length;

  if (!baseRef) {
    return {
      comparedPackages: packageDirs,
      currentPackageCount,
      diffs: [],
      failures: [],
      migrationNotePackages: [],
    };
  }

  const baseAccessor = createGitAccessor(rootDir, baseRef);
  const baseSnapshots = buildSnapshotsForAccessor(packageDirs, baseAccessor);
  const changedFiles = getChangedFiles(rootDir, baseRef);
  const migrationNotePackages = collectMigrationNotePackageDirs(
    rootDir,
    changedFiles,
    new Set(currentPackageDirs),
  );
  const diffs = comparePackageSnapshots(
    baseSnapshots,
    currentSnapshots,
    migrationNotePackages,
  );

  return {
    comparedPackages: packageDirs,
    currentPackageCount,
    diffs,
    failures: diffs.filter(
      (diff) => !diff.hasMigrationNote && !diff.hasVersionBump,
    ),
    migrationNotePackages: [...migrationNotePackages].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

export function buildSnapshotsForAccessor(
  packageDirs: string[],
  accessor: FileAccessor,
): PackageSnapshot[] {
  return packageDirs
    .map((packageDir) => buildPackageSnapshot(packageDir, accessor))
    .sort((left, right) => left.packageDir.localeCompare(right.packageDir));
}

export function buildPackageSnapshot(
  packageDir: string,
  accessor: FileAccessor,
): PackageSnapshot {
  const packageFiles = accessor.listPackageFiles(packageDir);
  const tree: PackageTree = {
    files: packageFiles,
    readFile: (filePath) =>
      accessor.readFile(toRepoFilePath(packageDir, filePath)),
  };

  const manifest = readManifest(tree);
  const packageName =
    manifest?.name ?? `${PACKAGE_PREFIX}${path.basename(packageDir)}`;
  const explicitModules = discoverExplicitModules(tree, manifest);
  const modulesToBuild =
    explicitModules.length > 0
      ? explicitModules
      : discoverFallbackModules(tree);
  const moduleSnapshots = modulesToBuild
    .map((moduleInput) => buildModuleSnapshot(packageDir, tree, moduleInput))
    .filter(
      (moduleSnapshot): moduleSnapshot is ModuleSnapshot =>
        moduleSnapshot !== null,
    )
    .sort((left, right) => left.specifier.localeCompare(right.specifier));

  return {
    modules: moduleSnapshots,
    packageDir,
    packageName,
    version: manifest?.version ?? null,
  };
}

export function comparePackageSnapshots(
  baseSnapshots: PackageSnapshot[],
  currentSnapshots: PackageSnapshot[],
  migrationNotePackages = new Set<string>(),
): PackageDiff[] {
  const baseByPackage = new Map(
    baseSnapshots.map((snapshot) => [snapshot.packageDir, snapshot]),
  );
  const currentByPackage = new Map(
    currentSnapshots.map((snapshot) => [snapshot.packageDir, snapshot]),
  );
  const packageDirs = [
    ...new Set([...baseByPackage.keys(), ...currentByPackage.keys()]),
  ];

  return packageDirs
    .map((packageDir) => {
      const baseSnapshot = baseByPackage.get(packageDir) ?? {
        modules: [],
        packageDir,
        packageName: `${PACKAGE_PREFIX}${path.basename(packageDir)}`,
        version: null,
      };
      const currentSnapshot = currentByPackage.get(packageDir) ?? {
        modules: [],
        packageDir,
        packageName: `${PACKAGE_PREFIX}${path.basename(packageDir)}`,
        version: null,
      };
      const baseModules = new Map(
        baseSnapshot.modules.map((module) => [module.specifier, module]),
      );
      const currentModules = new Map(
        currentSnapshot.modules.map((module) => [module.specifier, module]),
      );
      const specifiers = [
        ...new Set([...baseModules.keys(), ...currentModules.keys()]),
      ].sort((left, right) => left.localeCompare(right));
      const changedModules: ChangedModule[] = [];

      for (const specifier of specifiers) {
        const baseModule = baseModules.get(specifier) ?? null;
        const currentModule = currentModules.get(specifier) ?? null;

        if (baseModule && !currentModule) {
          changedModules.push({
            baseHash: baseModule.hash,
            currentHash: null,
            kind: 'removed',
            specifier,
          });
          continue;
        }

        if (!baseModule && currentModule) {
          changedModules.push({
            baseHash: null,
            currentHash: currentModule.hash,
            kind: 'added',
            specifier,
          });
          continue;
        }

        if (
          baseModule &&
          currentModule &&
          baseModule.hash !== currentModule.hash
        ) {
          changedModules.push({
            baseHash: baseModule.hash,
            currentHash: currentModule.hash,
            kind: 'changed',
            specifier,
          });
        }
      }

      if (changedModules.length === 0) {
        return null;
      }

      return {
        baseVersion: baseSnapshot.version,
        changedModules,
        currentVersion: currentSnapshot.version,
        hasMigrationNote: migrationNotePackages.has(packageDir),
        hasVersionBump:
          baseSnapshot.version !== null &&
          currentSnapshot.version !== null &&
          baseSnapshot.version !== currentSnapshot.version,
        packageDir,
        packageName: currentSnapshot.packageName,
      } satisfies PackageDiff;
    })
    .filter((diff): diff is PackageDiff => diff !== null)
    .sort((left, right) => left.packageDir.localeCompare(right.packageDir));
}

export function collectMigrationNotePackageDirs(
  rootDir: string,
  changedFiles: string[],
  knownPackageDirs: Set<string>,
): Set<string> {
  const packageDirs = new Set<string>();

  for (const filePath of changedFiles) {
    if (!filePath.startsWith(`${CHANGES_ROOT}/`) || !filePath.endsWith('.md')) {
      continue;
    }

    const absolutePath = path.join(rootDir, filePath);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const basename = path.basename(filePath, '.md');
    const basenameTokens = basename
      .split(/[^a-z0-9-]+/iu)
      .map((token) => token.trim())
      .filter(Boolean);

    for (const token of basenameTokens) {
      const packageDir = `${PACKAGES_ROOT}/${token}`;
      if (knownPackageDirs.has(packageDir)) {
        packageDirs.add(packageDir);
      }
    }

    const content = readFileSync(absolutePath, 'utf8');
    const matches = [...content.matchAll(/^\s*packages?\s*:\s*(.+)$/gimu)];

    for (const match of matches) {
      const packageNames = match[1]
        .split(/[,\s]+/u)
        .map((value) => value.trim())
        .filter(Boolean);

      for (const packageName of packageNames) {
        const normalizedPackageName = packageName.replace(
          new RegExp(`^${PACKAGE_PREFIX}`),
          '',
        );
        const packageDir = `${PACKAGES_ROOT}/${normalizedPackageName}`;
        if (knownPackageDirs.has(packageDir)) {
          packageDirs.add(packageDir);
        }
      }
    }
  }

  return packageDirs;
}

function parseCliArgs(argv: string[]): CliArgs {
  let allPackages = false;
  let baseRef: string | null = null;
  let isJson = false;
  let writeSnapshot: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--all') {
      allPackages = true;
      continue;
    }

    if (argument === '--json') {
      isJson = true;
      continue;
    }

    if (argument === '--base-ref') {
      baseRef = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (argument === '--write-snapshot') {
      writeSnapshot = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return { allPackages, baseRef, isJson, writeSnapshot };
}

function main(): void {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const currentPackageDirs = discoverCurrentPackageDirs(rootDir);
  const packageDirs = cliArgs.allPackages
    ? currentPackageDirs
    : resolvePackageDirsForRun(rootDir, cliArgs.baseRef, currentPackageDirs);
  const report = runCheckPackageApiSurface({
    baseRef: cliArgs.baseRef,
    packageDirs,
    rootDir,
  });

  if (cliArgs.writeSnapshot) {
    mkdirSync(path.dirname(cliArgs.writeSnapshot), { recursive: true });
    writeFileSync(
      cliArgs.writeSnapshot,
      JSON.stringify(
        buildSnapshotsForAccessor(packageDirs, createDiskAccessor(rootDir)),
        null,
        2,
      ),
      'utf8',
    );
  }

  if (cliArgs.isJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printReport(report, cliArgs.baseRef);
  }

  if (report.failures.length > 0) {
    process.exitCode = 1;
  }
}

function printReport(report: RunReport, baseRef: string | null): void {
  if (report.comparedPackages.length === 0) {
    process.stdout.write(
      'No package changes detected for API surface audit.\n',
    );
    return;
  }

  process.stdout.write(
    `Compared ${report.comparedPackages.length} package(s) out of ${report.currentPackageCount} under ${PACKAGES_ROOT}/`,
  );
  if (baseRef) {
    process.stdout.write(` against ${baseRef}`);
  }
  process.stdout.write('.\n');

  if (report.diffs.length === 0) {
    process.stdout.write('No public API surface changes detected.\n');
    return;
  }

  process.stdout.write('\nDetected public API surface changes:\n');

  for (const diff of report.diffs) {
    process.stdout.write(
      `\n- ${diff.packageName} (${diff.packageDir}) ${diff.hasVersionBump ? '[version bumped]' : ''}${diff.hasMigrationNote ? '[migration note]' : ''}\n`,
    );

    for (const changedModule of diff.changedModules) {
      process.stdout.write(
        `  - ${changedModule.kind}: ${changedModule.specifier}\n`,
      );
    }
  }

  if (report.failures.length === 0) {
    process.stdout.write(
      '\nAll package API surface changes are covered by a version bump or a migration note.\n',
    );
    return;
  }

  process.stdout.write(
    '\nMissing version bump or migration note for the package(s) above.\n',
  );
  process.stdout.write(
    `Add a package version bump or a markdown note under ${CHANGES_ROOT}/. Example:\n`,
  );
  process.stdout.write(
    `  ${CHANGES_ROOT}/web-ui-public-api.md with a line like "packages: ui"\n`,
  );
}

function resolvePackageDirsForRun(
  rootDir: string,
  baseRef: string | null,
  currentPackageDirs: string[],
): string[] {
  if (!baseRef) {
    return currentPackageDirs;
  }

  const changedFiles = getChangedFiles(rootDir, baseRef);
  const packageDirs = new Set<string>();

  for (const filePath of changedFiles) {
    const match = /^(packages\/[^/]+)\//u.exec(filePath);
    if (match?.[1]) {
      packageDirs.add(match[1]);
    }
  }

  return [...packageDirs].sort((left, right) => left.localeCompare(right));
}

function discoverCurrentPackageDirs(rootDir: string): string[] {
  const packagesRoot = path.join(rootDir, PACKAGES_ROOT);

  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.posix.join(PACKAGES_ROOT, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function createDiskAccessor(rootDir: string): FileAccessor {
  return {
    exists(filePath) {
      return existsSync(path.join(rootDir, filePath));
    },
    listPackageFiles(packageDir) {
      const absoluteDir = path.join(rootDir, packageDir);
      if (!existsSync(absoluteDir)) {
        return [];
      }

      return walkDiskFiles(absoluteDir);
    },
    readFile(filePath) {
      const absolutePath = path.join(rootDir, filePath);
      if (!existsSync(absolutePath)) {
        return null;
      }

      return readFileSync(absolutePath, 'utf8');
    },
  };
}

function createGitAccessor(rootDir: string, ref: string): FileAccessor {
  return {
    exists(filePath) {
      const result = runGit(rootDir, ['cat-file', '-e', `${ref}:${filePath}`]);
      return result.status === 0;
    },
    listPackageFiles(packageDir) {
      const result = runGit(rootDir, [
        'ls-tree',
        '-r',
        '--name-only',
        ref,
        '--',
        packageDir,
      ]);

      if (result.status !== 0) {
        return [];
      }

      return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((filePath) => path.posix.relative(packageDir, filePath))
        .sort((left, right) => left.localeCompare(right));
    },
    readFile(filePath) {
      const result = runGit(rootDir, ['show', `${ref}:${filePath}`]);
      if (result.status !== 0) {
        return null;
      }

      return result.stdout;
    },
  };
}

function walkDiskFiles(dirPath: string, base = ''): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const relativePath = base ? path.posix.join(base, entry.name) : entry.name;
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...walkDiskFiles(absolutePath, relativePath));
      continue;
    }

    results.push(relativePath);
  }

  return results.sort((left, right) => left.localeCompare(right));
}

function discoverExplicitModules(
  tree: PackageTree,
  manifest: PackageManifest | null,
): Array<{ filePath: string; specifier: string }> {
  if (!manifest?.exports) {
    return [];
  }

  const modules: Array<{ filePath: string; specifier: string }> = [];
  const exportEntries = normalizeExportEntries(manifest.exports);

  for (const [exportKey, exportTarget] of exportEntries) {
    const targetPath = selectExportTarget(exportTarget);
    if (!targetPath) {
      continue;
    }

    const normalizedTargetPath = stripLeadingDotSlash(targetPath);
    if (normalizedTargetPath.includes('*') && exportKey.includes('*')) {
      const wildcardRegex = createWildcardRegex(normalizedTargetPath);

      for (const filePath of tree.files) {
        if (!isEligibleExplicitSignatureFile(filePath)) {
          continue;
        }

        const match = wildcardRegex.exec(filePath);
        if (!match?.[1]) {
          continue;
        }

        const exportFragment = trimModuleSuffix(match[1]);
        modules.push({
          filePath,
          specifier: exportKey.replace('*', exportFragment),
        });
      }
      continue;
    }

    const resolvedFilePath = resolveManifestTargetFile(
      tree.files,
      normalizedTargetPath,
    );
    if (!resolvedFilePath) {
      continue;
    }

    modules.push({
      filePath: resolvedFilePath,
      specifier: exportKey,
    });
  }

  return dedupeModules(modules);
}

function discoverFallbackModules(
  tree: PackageTree,
): Array<{ filePath: string; specifier: string }> {
  const candidateFiles = tree.files.filter((filePath) =>
    isEligibleSignatureFile(filePath),
  );
  const nonDistFiles = candidateFiles.filter(
    (filePath) => !filePath.startsWith('dist/'),
  );
  const selectedFiles = nonDistFiles.length > 0 ? nonDistFiles : candidateFiles;

  return dedupeModules(
    selectedFiles.map((filePath) => ({
      filePath,
      specifier: filePathToSpecifier(filePath),
    })),
  );
}

function buildModuleSnapshot(
  packageDir: string,
  tree: PackageTree,
  moduleInput: { filePath: string; specifier: string },
): ModuleSnapshot | null {
  const fileContent = tree.readFile(moduleInput.filePath);
  if (fileContent === null) {
    return null;
  }

  const signature = createSignature(
    toRepoFilePath(packageDir, moduleInput.filePath),
    fileContent,
  );

  if (!isMeaningfulSignature(signature)) {
    return null;
  }

  return {
    filePath: toRepoFilePath(packageDir, moduleInput.filePath),
    hash: createHash('sha256').update(signature).digest('hex'),
    signature,
    specifier: normalizeSpecifier(moduleInput.specifier),
  };
}

function createSignature(filePath: string, fileContent: string): string {
  try {
    const result = ts.transpileDeclaration(fileContent, {
      compilerOptions: {
        declaration: true,
        emitDeclarationOnly: true,
        esModuleInterop: true,
        jsx: resolveJsxMode(filePath),
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2020,
        verbatimModuleSyntax: true,
      },
      fileName: filePath,
      reportDiagnostics: true,
    });

    const declarationText =
      result.outputText.length > 0 || !filePath.endsWith('.d.ts')
        ? result.outputText
        : fileContent;

    return normalizeSignatureText(declarationText);
  } catch {
    return normalizeSignatureText(fileContent);
  }
}

function isMeaningfulSignature(signature: string): boolean {
  return signature.length > 0 && signature !== 'export {};';
}

function normalizeSignatureText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\/\/# sourceMappingURL=.*$/gmu, '')
    .trim();
}

function readManifest(tree: PackageTree): PackageManifest | null {
  const packageJson = tree.readFile('package.json');
  if (!packageJson) {
    return null;
  }

  return JSON.parse(packageJson) as PackageManifest;
}

function normalizeExportEntries(
  exportsField: PackageManifest['exports'],
): Array<[string, ExportTarget]> {
  if (typeof exportsField === 'string') {
    return [['.', exportsField]];
  }

  if (!exportsField || Array.isArray(exportsField)) {
    return [];
  }

  const hasConditionKeys =
    'types' in exportsField ||
    'default' in exportsField ||
    'import' in exportsField ||
    'require' in exportsField ||
    'bun' in exportsField;

  if (hasConditionKeys) {
    return [['.', exportsField]];
  }

  return Object.entries(exportsField);
}

function selectExportTarget(exportTarget: ExportTarget): string | null {
  if (typeof exportTarget === 'string') {
    return exportTarget;
  }

  return (
    exportTarget.types ??
    exportTarget.default ??
    exportTarget.import ??
    exportTarget.require ??
    exportTarget.bun ??
    null
  );
}

function resolveManifestTargetFile(
  packageFiles: string[],
  targetPath: string,
): string | null {
  const targetCandidates = [targetPath];

  if (targetPath.endsWith('.js')) {
    targetCandidates.unshift(targetPath.replace(/\.js$/u, '.d.ts'));
    targetCandidates.push(targetPath.replace(/\.js$/u, '.ts'));
    targetCandidates.push(targetPath.replace(/\.js$/u, '.tsx'));
  }

  for (const targetCandidate of targetCandidates) {
    const resolved = resolveFileFromCandidates(packageFiles, targetCandidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveFileFromCandidates(
  packageFiles: string[],
  targetPath: string,
): string | null {
  const normalizedPath = stripLeadingDotSlash(targetPath);
  const candidatePaths = [
    normalizedPath,
    `${normalizedPath}.d.ts`,
    `${normalizedPath}.ts`,
    `${normalizedPath}.tsx`,
    `${normalizedPath}/index.d.ts`,
    `${normalizedPath}/index.ts`,
    `${normalizedPath}/index.tsx`,
  ];

  for (const candidatePath of candidatePaths) {
    if (packageFiles.includes(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function createWildcardRegex(pattern: string): RegExp {
  const escapedPattern = escapeRegex(stripLeadingDotSlash(pattern));
  return new RegExp(`^${escapedPattern.replace(/\\\*/g, '(.+)')}$`, 'u');
}

function dedupeModules(
  modules: Array<{ filePath: string; specifier: string }>,
): Array<{ filePath: string; specifier: string }> {
  const deduped = new Map<string, { filePath: string; specifier: string }>();

  for (const moduleEntry of modules) {
    deduped.set(normalizeSpecifier(moduleEntry.specifier), {
      filePath: moduleEntry.filePath,
      specifier: normalizeSpecifier(moduleEntry.specifier),
    });
  }

  return [...deduped.values()].sort((left, right) =>
    left.specifier.localeCompare(right.specifier),
  );
}

function isEligibleSignatureFile(filePath: string): boolean {
  if (!/\.(d\.ts|ts|tsx)$/u.test(filePath)) {
    return false;
  }

  const basename = path.posix.basename(filePath);
  if (basename.startsWith('.')) {
    return false;
  }

  const segments = filePath.split('/');
  if (
    segments.some(
      (segment) =>
        IGNORED_PATH_SEGMENTS.has(segment) ||
        segment === '__mocks__' ||
        segment === '__tests__',
    )
  ) {
    return false;
  }

  return !FALLBACK_IGNORED_FILE_PATTERNS.some((pattern) =>
    pattern.test(filePath),
  );
}

function isEligibleExplicitSignatureFile(filePath: string): boolean {
  if (!/\.(d\.ts|ts|tsx)$/u.test(filePath)) {
    return false;
  }

  const basename = path.posix.basename(filePath);
  if (basename.startsWith('.')) {
    return false;
  }

  const segments = filePath.split('/');
  if (
    segments.some(
      (segment) =>
        segment === '__mocks__' ||
        segment === '__tests__' ||
        segment === 'coverage' ||
        segment === '.turbo' ||
        segment === 'node_modules',
    )
  ) {
    return false;
  }

  return !FALLBACK_IGNORED_FILE_PATTERNS.some((pattern) =>
    pattern.test(filePath),
  );
}

function filePathToSpecifier(filePath: string): string {
  let modulePath = filePath;

  if (modulePath.startsWith('dist/')) {
    modulePath = modulePath.slice('dist/'.length);
  }

  modulePath = trimModuleSuffix(modulePath);

  if (modulePath === 'index') {
    return '.';
  }

  return `./${modulePath}`;
}

function trimModuleSuffix(value: string): string {
  return value
    .replace(/\.d\.ts$/u, '')
    .replace(/\.tsx?$/u, '')
    .replace(/\/index$/u, '');
}

function normalizeSpecifier(specifier: string): string {
  if (specifier === '.' || specifier === './') {
    return '.';
  }

  if (specifier.startsWith('./')) {
    return specifier;
  }

  if (specifier.startsWith('.')) {
    return specifier;
  }

  return `./${specifier}`;
}

function getChangedFiles(rootDir: string, baseRef: string): string[] {
  const result = runGit(rootDir, ['diff', '--name-only', `${baseRef}...HEAD`]);

  if (result.status !== 0) {
    throw new Error(
      `Failed to diff against ${baseRef}: ${result.stderr || 'unknown git error'}`,
    );
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function runGit(
  rootDir: string,
  args: string[],
): { status: number; stderr: string; stdout: string } {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    status: result.status ?? 1,
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim(),
  };
}

function resolveJsxMode(filePath: string): ts.JsxEmit {
  return filePath.endsWith('.tsx') ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve;
}

function toRepoFilePath(packageDir: string, filePath: string): string {
  return path.posix.join(packageDir, filePath);
}

function stripLeadingDotSlash(value: string): string {
  return value.replace(/^\.\//u, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (process.argv[1]?.endsWith('check-package-api-surface.ts')) {
  main();
}
