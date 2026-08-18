/**
 * Guardrail: `@genfeedai/config` must not expose mutable license state (#2346).
 *
 * `packages/config/src/license-state.ts` holds the process-wide enterprise
 * verdict. Only the license reader and the server-side verifier may touch it —
 * a wildcard subpath export (`./*`) or a direct import from anywhere else would
 * let product code flip EE on without verifying a signed license.
 *
 * The check also pins every declared subpath to a real source module, so the
 * built export map and the generated declarations cannot drift apart.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const CONFIG_PACKAGE_JSON = 'packages/config/package.json';
const CONFIG_SRC_DIR = 'packages/config/src';

/** Modules that stay private to the package regardless of the export map. */
const INTERNAL_MODULES = new Set(['license-state']);

/** The only production callers allowed to reach internal modules directly. */
const INTERNAL_MODULE_OWNERS = new Set([
  'packages/config/src/license-server.ts',
  'packages/config/src/license.ts',
]);

const DEFAULT_INCLUDE_GLOBS = [
  'apps/**/*.{cjs,js,mjs,ts,tsx}',
  'packages/**/*.{cjs,js,mjs,ts,tsx}',
  'scripts/**/*.{cjs,js,mjs,ts,tsx}',
];
const DEFAULT_IGNORE_GLOBS = [
  // Specs reach license state through the sanctioned `*ForTests` helpers on
  // `license-server`; scanning them would also flag this guard's own fixtures.
  '**/*.spec.*',
  '**/*.test.*',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
];

const MODULE_SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu;
const PACKAGE_SUBPATH_PATTERN = /^(?:@genfeedai\/config|@config)\/(.+)$/u;

export type ConfigPackageBoundaryViolation = {
  file: string;
  line?: number;
  message: string;
  specifier: string;
};

export type ConfigPackageBoundaryResult = {
  scannedFileCount: number;
  violations: ConfigPackageBoundaryViolation[];
};

export type ConfigPackageBoundaryOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  packageJsonPath?: string;
  rootDir?: string;
};

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function toModuleName(subpath: string): string {
  return subpath.replace(/\.(?:d\.ts|cts|js|mjs|mts|ts)$/u, '');
}

function isInternalModuleName(subpath: string): boolean {
  return INTERNAL_MODULES.has(toModuleName(subpath));
}

function collectExportTargets(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectExportTargets);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(collectExportTargets);
  }

  return [];
}

/**
 * `./dist/license.js` and `./dist/schemas/index.d.ts` must be emitted from
 * `src/license.ts` and `src/schemas/index.ts` respectively — a target with no
 * source module means the published subpath resolves to nothing.
 */
function sourceModuleForTarget(target: string): string | undefined {
  const normalized = target.replace(/^\.\//u, '');
  if (!normalized.startsWith('dist/')) {
    return undefined;
  }

  return `${CONFIG_SRC_DIR}/${toModuleName(normalized.slice('dist/'.length))}.ts`;
}

function collectManifestViolations(
  packageJsonPath: string,
  rootDir: string,
): ConfigPackageBoundaryViolation[] {
  const manifestFile = path
    .relative(rootDir, packageJsonPath)
    .replaceAll('\\', '/');
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as Record<string, unknown>;
  const violations: ConfigPackageBoundaryViolation[] = [];

  const exportsMap = packageJson.exports;
  const exportEntries =
    typeof exportsMap === 'object' && exportsMap !== null
      ? Object.entries(exportsMap as Record<string, unknown>)
      : [];

  const typesVersions = packageJson.typesVersions;
  const typesVersionEntries =
    typeof typesVersions === 'object' && typesVersions !== null
      ? Object.values(typesVersions as Record<string, unknown>).flatMap(
          (entry) =>
            typeof entry === 'object' && entry !== null
              ? Object.entries(entry as Record<string, unknown>)
              : [],
        )
      : [];

  const declaredSubpaths = [...exportEntries, ...typesVersionEntries];

  for (const [declaredKey, value] of declaredSubpaths) {
    const subpath = declaredKey.replace(/^\.\/?/u, '');

    if (subpath.includes('*')) {
      violations.push({
        file: manifestFile,
        message:
          'Wildcard subpaths expose every module in the package, including internal license state. Declare each public subpath explicitly.',
        specifier: declaredKey,
      });
      continue;
    }

    if (subpath !== '' && isInternalModuleName(subpath)) {
      violations.push({
        file: manifestFile,
        message: `'${toModuleName(subpath)}' is internal to @genfeedai/config and must not be a publicly declared subpath.`,
        specifier: declaredKey,
      });
      continue;
    }

    for (const target of collectExportTargets(value)) {
      if (isInternalModuleName(path.basename(target))) {
        violations.push({
          file: manifestFile,
          message: `Declared target '${target}' points at an internal module.`,
          specifier: declaredKey,
        });
        continue;
      }

      const sourceModule = sourceModuleForTarget(target);
      if (sourceModule && !existsSync(path.join(rootDir, sourceModule))) {
        violations.push({
          file: manifestFile,
          message: `Declared target '${target}' has no source module at '${sourceModule}'; the build emits neither the entry point nor its declarations.`,
          specifier: declaredKey,
        });
      }
    }
  }

  return violations;
}

function resolvesToInternalModule(
  specifier: string,
  file: string,
  rootDir: string,
): boolean {
  const packageSubpath = PACKAGE_SUBPATH_PATTERN.exec(specifier)?.[1];
  if (packageSubpath) {
    return isInternalModuleName(packageSubpath);
  }

  const normalizedSpecifier = specifier.replaceAll('\\', '/');
  if (!normalizedSpecifier.startsWith('.')) {
    // Absolute paths and tool aliases that reach straight into the source tree.
    return (
      normalizedSpecifier.includes(`${CONFIG_SRC_DIR}/`) &&
      isInternalModuleName(path.basename(normalizedSpecifier))
    );
  }

  const resolved = path
    .relative(
      rootDir,
      path.resolve(path.dirname(path.join(rootDir, file)), specifier),
    )
    .replaceAll('\\', '/');

  return (
    path.dirname(resolved) === CONFIG_SRC_DIR &&
    isInternalModuleName(path.basename(resolved))
  );
}

function collectImportViolations(
  file: string,
  rootDir: string,
): ConfigPackageBoundaryViolation[] {
  if (INTERNAL_MODULE_OWNERS.has(file)) {
    return [];
  }

  const source = readFileSync(path.join(rootDir, file), 'utf8');

  return [...source.matchAll(MODULE_SPECIFIER_PATTERN)]
    .filter((match) => resolvesToInternalModule(match[1] ?? '', file, rootDir))
    .map((match) => ({
      file,
      line: lineForOffset(source, match.index),
      message:
        'Mutable license state is internal to @genfeedai/config. Read the verdict through isEEEnabled() and write it through the server license verification API.',
      specifier: match[1] ?? '',
    }));
}

export function runCheckConfigPackageBoundary(
  options: ConfigPackageBoundaryOptions = {},
): ConfigPackageBoundaryResult {
  const rootDir = options.rootDir ?? process.cwd();
  const packageJsonPath = path.resolve(
    rootDir,
    options.packageJsonPath ?? CONFIG_PACKAGE_JSON,
  );
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  })
    .map((file) => file.replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right));

  const violations = files.flatMap((file) =>
    collectImportViolations(file, rootDir),
  );

  if (existsSync(packageJsonPath)) {
    violations.push(...collectManifestViolations(packageJsonPath, rootDir));
  }

  return { scannedFileCount: files.length, violations };
}

if (import.meta.main) {
  const result = runCheckConfigPackageBoundary();

  if (result.violations.length > 0) {
    console.error('Config package boundary violations:');
    for (const violation of result.violations) {
      const location = violation.line
        ? `${violation.file}:${violation.line}`
        : violation.file;
      console.error(
        `- ${location} [${violation.specifier}] ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Config package boundary passed across ${result.scannedFileCount} source file(s).`,
  );
}
