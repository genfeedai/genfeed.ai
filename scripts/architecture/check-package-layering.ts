/**
 * Guardrail: shared packages may only import packages on the same or a lower
 * layer, and never an app.
 *
 * The layers run from pure contracts at the bottom to screen-level packages at
 * the top. An import that climbs a layer is how the shared packages grew into
 * cycles (ui -> pages -> ui, hooks -> ui -> hooks), so new ones fail here.
 *
 * Existing upward imports are ratcheted per file in
 * `package-layering.baseline.json`: a file may never gain upward imports, and a
 * baseline entry that shrinks must be lowered (a stale entry also fails) so the
 * count only goes down. Run with `--update-baseline` after removing some.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const BASELINE_PATH = 'scripts/architecture/package-layering.baseline.json';

/**
 * Lower numbers sit lower. A package may import its own layer or below.
 * A new package must be added here before it can import anything.
 */
export const PACKAGE_LAYERS: Readonly<Record<string, number>> = {
  // 0: contracts and static assets
  contracts: 0,
  errors: 0,
  fonts: 0,
  styles: 0,
  tsconfig: 0,
  // 1: framework-free building blocks
  actions: 1,
  'auth-client': 1,
  client: 1,
  config: 1,
  harness: 1,
  helpers: 1,
  integrations: 1,
  pricing: 1,
  prisma: 1,
  storage: 1,
  // 2: data access
  libs: 2,
  models: 2,
  serializers: 2,
  services: 2,
  utils: 2,
  // 3: React state and component prop types
  contexts: 3,
  hooks: 3,
  props: 3,
  // 4: components
  ui: 4,
  // 5: features and screens
  agent: 5,
  workflows: 5,
  // 6: leaf tooling
  cli: 6,
  create: 6,
  'desktop-core': 6,
  'desktop-prisma': 6,
  'next-config': 6,
};

/** Workspace path aliases that resolve into a shared package. */
const PACKAGE_ALIASES: Readonly<Record<string, string>> = {
  '@cloud-types': 'contracts',
  '@components': 'ui',
  '@config': 'config',
  '@configs': 'next-config',
  '@contexts': 'contexts',
  '@fonts': 'fonts',
  '@helpers': 'helpers',
  '@hooks': 'hooks',
  '@integrations': 'integrations',
  '@libs': 'libs',
  '@models': 'models',
  '@props': 'props',
  '@providers': 'contexts',
  '@serializers': 'serializers',
  '@services': 'services',
  '@styles': 'styles',
  '@ui': 'ui',
  '@ui-constants': 'ui',
  '@utils': 'utils',
};

/** Workspace path aliases that resolve into an app. Packages never import apps. */
const APP_ALIAS_PATTERN =
  /^@(?:app|app-[a-z]+|api|api-[a-z]+|website|web-components|web-hooks|mcp|files|workers|notifications|discord|slack|telegram|protected)(?:\/|$)/u;

const APP_TARGET = 'apps';

const DEFAULT_INCLUDE_GLOBS = ['packages/*/**/*.{cjs,js,mjs,ts,tsx}'];
const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.*',
  '**/*.test.*',
  '**/*.stories.*',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/tests/**',
  '**/test/**',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
  'packages/*/vitest.config.*',
  'packages/*/vitest-globals.d.ts',
];

const MODULE_SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gmu;

export type PackageLayeringViolation = {
  allowed: number;
  count: number;
  file: string;
  imports: string[];
  kind: 'stale-baseline' | 'unknown-package' | 'upward-import';
  message: string;
};

export type PackageLayeringOptions = {
  baseline?: Readonly<Record<string, number>>;
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export type PackageLayeringResult = {
  counts: Record<string, number>;
  scannedFileCount: number;
  totalUpwardImports: number;
  violations: PackageLayeringViolation[];
};

function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}

function packageOfFile(file: string): string | undefined {
  return /^packages\/([^/]+)\//u.exec(file)?.[1];
}

/** The package or app an import specifier lands in, if it leaves its package. */
export function resolveImportTarget(
  specifier: string,
  file: string,
): string | undefined {
  const scoped = /^@genfeedai\/([^/]+)/u.exec(specifier)?.[1];
  if (scoped) {
    return scoped;
  }

  if (APP_ALIAS_PATTERN.test(specifier)) {
    return APP_TARGET;
  }

  const aliasTarget = PACKAGE_ALIASES[specifier.split('/')[0] ?? ''];
  if (aliasTarget) {
    return aliasTarget;
  }

  if (specifier.startsWith('.')) {
    const resolved = normalizePath(
      path.posix.normalize(
        path.posix.join(path.posix.dirname(file), specifier),
      ),
    );
    if (resolved.startsWith('apps/')) {
      return APP_TARGET;
    }
    return packageOfFile(resolved);
  }

  return undefined;
}

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

export function runCheckPackageLayering(
  options: PackageLayeringOptions = {},
): PackageLayeringResult {
  const rootDir = options.rootDir ?? process.cwd();
  const baseline = options.baseline ?? readBaseline(rootDir);
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort();

  const counts: Record<string, number> = {};
  const upwardImports = new Map<string, string[]>();
  const violations: PackageLayeringViolation[] = [];
  const unrankedPackages = new Set<string>();
  let totalUpwardImports = 0;

  for (const filePath of files) {
    const file = normalizePath(path.relative(rootDir, filePath));
    const sourcePackage = packageOfFile(file);
    if (!sourcePackage) {
      continue;
    }

    const sourceLayer = PACKAGE_LAYERS[sourcePackage];
    if (sourceLayer === undefined) {
      if (unrankedPackages.has(sourcePackage)) {
        continue;
      }
      unrankedPackages.add(sourcePackage);
      violations.push({
        allowed: 0,
        count: 0,
        file,
        imports: [],
        kind: 'unknown-package',
        message: `packages/${sourcePackage} has no layer. Add it to PACKAGE_LAYERS in check-package-layering.ts.`,
      });
      continue;
    }

    const source = readFileSync(filePath, 'utf8');
    const climbing: string[] = [];

    for (const match of source.matchAll(MODULE_SPECIFIER_PATTERN)) {
      const specifier = match[1] ?? '';
      const target = resolveImportTarget(specifier, file);
      if (!target || target === sourcePackage) {
        continue;
      }

      const targetLayer =
        target === APP_TARGET
          ? Number.POSITIVE_INFINITY
          : PACKAGE_LAYERS[target];
      if (targetLayer === undefined || targetLayer <= sourceLayer) {
        continue;
      }

      climbing.push(
        `${lineForOffset(source, match.index ?? 0)}: ${specifier} (${sourcePackage} -> ${target})`,
      );
    }

    if (climbing.length > 0) {
      counts[file] = climbing.length;
      upwardImports.set(file, climbing);
      totalUpwardImports += climbing.length;
    }
  }

  for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 0;
    const imports = upwardImports.get(file) ?? [];
    if (count > allowed) {
      violations.push({
        allowed,
        count,
        file,
        imports,
        kind: 'upward-import',
        message:
          'Imports a package on a higher layer (or an app). Move the code to the layer that owns it, or move the shared piece down.',
      });
    } else if (count < allowed) {
      violations.push({
        allowed,
        count,
        file,
        imports,
        kind: 'stale-baseline',
        message: `Baseline allows ${allowed} but only ${count} remain. Run \`bun run check:package-layering --update-baseline\`.`,
      });
    }
  }

  for (const [file, allowed] of Object.entries(baseline)) {
    if (counts[file] === undefined) {
      violations.push({
        allowed,
        count: 0,
        file,
        imports: [],
        kind: 'stale-baseline',
        message:
          'No upward import remains in this file. Run `bun run check:package-layering --update-baseline`.',
      });
    }
  }

  return {
    counts,
    scannedFileCount: files.length,
    totalUpwardImports,
    violations: violations,
  };
}

function readBaseline(rootDir: string): Record<string, number> {
  return JSON.parse(
    readFileSync(path.join(rootDir, BASELINE_PATH), 'utf8'),
  ) as Record<string, number>;
}

function writeBaseline(rootDir: string, counts: Record<string, number>): void {
  const sorted = Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    path.join(rootDir, BASELINE_PATH),
    `${JSON.stringify(sorted, null, 2)}\n`,
    'utf8',
  );
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const rootDir = process.cwd();
  const isUpdate = process.argv.includes('--update-baseline');
  const result = runCheckPackageLayering({
    baseline: isUpdate ? {} : undefined,
    rootDir,
  });

  if (isUpdate) {
    const unknown = result.violations.filter(
      (violation) => violation.kind === 'unknown-package',
    );
    if (unknown.length > 0) {
      for (const violation of unknown) {
        console.error(`- ${violation.file} — ${violation.message}`);
      }
      process.exit(1);
    }
    writeBaseline(rootDir, result.counts);
    console.log(
      `Package layering baseline written: ${result.totalUpwardImports} upward import(s) across ${Object.keys(result.counts).length} file(s).`,
    );
    process.exit(0);
  }

  if (result.violations.length > 0) {
    console.error('Package layering violations found:');
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file} (${violation.count}/${violation.allowed}) — ${violation.message}`,
      );
      for (const line of violation.imports) {
        console.error(`    ${line}`);
      }
    }
    process.exit(1);
  }

  console.log(
    `Package layering guard passed: ${result.totalUpwardImports} baselined upward import(s) across ${result.scannedFileCount} source file(s).`,
  );
}
