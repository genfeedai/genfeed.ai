import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const TYPESCRIPT_6_VERSION = '6.0.3';
const TYPESCRIPT_7_ALIAS = 'npm:typescript@7.0.2';

const LEGACY_API_CONSUMERS = new Set([
  'apps/app/package.json',
  'apps/desktop/app/package.json',
  'apps/docs/package.json',
  'apps/website/package.json',
  'package.json',
  'packages/errors/package.json',
  'packages/harness/package.json',
  'packages/contracts/src/types/package.json',
  'packages/workflows/package.json',
]);

type DependencySection = Record<string, string> | undefined;

type PackageManifest = {
  dependencies?: DependencySection;
  devDependencies?: DependencySection;
  optionalDependencies?: DependencySection;
  overrides?: DependencySection;
  peerDependencies?: DependencySection;
};

function dependencyVersion(
  manifest: PackageManifest,
  dependencyName: string,
): string | undefined {
  return (
    manifest.dependencies?.[dependencyName] ??
    manifest.devDependencies?.[dependencyName] ??
    manifest.optionalDependencies?.[dependencyName] ??
    manifest.peerDependencies?.[dependencyName]
  );
}

const manifestPaths = globSync(
  [
    'package.json',
    'apps/**/package.json',
    'packages/**/package.json',
    'scripts/**/package.json',
  ],
  {
    ignore: ['**/dist/**', '**/node_modules/**'],
    nodir: true,
  },
).sort((left, right) => left.localeCompare(right));

const violations: string[] = [];

for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as PackageManifest;
  const typescriptVersion = dependencyVersion(manifest, 'typescript');
  const nativeVersion = dependencyVersion(manifest, '@typescript/native');

  if (LEGACY_API_CONSUMERS.has(manifestPath) && !typescriptVersion) {
    violations.push(
      `${manifestPath}: configured TypeScript API consumer must declare TypeScript ${TYPESCRIPT_6_VERSION}.`,
    );
  }

  if (typescriptVersion) {
    if (!LEGACY_API_CONSUMERS.has(manifestPath)) {
      violations.push(
        `${manifestPath}: TypeScript 6 is restricted to compiler-API consumers.`,
      );
    }
    if (typescriptVersion !== TYPESCRIPT_6_VERSION) {
      violations.push(
        `${manifestPath}: expected TypeScript API compatibility version ${TYPESCRIPT_6_VERSION}, found ${typescriptVersion}.`,
      );
    }
    if (nativeVersion !== TYPESCRIPT_7_ALIAS) {
      violations.push(
        `${manifestPath}: TypeScript API consumers must also declare @typescript/native ${TYPESCRIPT_7_ALIAS}.`,
      );
    }
  }

  if (nativeVersion && nativeVersion !== TYPESCRIPT_7_ALIAS) {
    violations.push(
      `${manifestPath}: expected @typescript/native ${TYPESCRIPT_7_ALIAS}, found ${nativeVersion}.`,
    );
  }

  const typescriptOverride = manifest.overrides?.typescript;
  if (
    typescriptOverride &&
    (typescriptOverride !== TYPESCRIPT_6_VERSION ||
      !LEGACY_API_CONSUMERS.has(manifestPath))
  ) {
    violations.push(
      `${manifestPath}: TypeScript override ${typescriptOverride} is restricted to compiler-API consumers; expected ${TYPESCRIPT_6_VERSION}.`,
    );
  }
}

for (const expectedConsumer of LEGACY_API_CONSUMERS) {
  if (!manifestPaths.includes(expectedConsumer)) {
    violations.push(
      `${expectedConsumer}: configured TypeScript API consumer manifest does not exist.`,
    );
  }
}

const compilerVersion = spawnSync('node_modules/.bin/tsc', ['--version'], {
  encoding: 'utf8',
});
const compilerStdout = compilerVersion.stdout?.trim() ?? '';
const compilerStderr = compilerVersion.stderr?.trim() ?? '';
const compilerError = compilerVersion.error?.message ?? '';
if (compilerVersion.status !== 0 || compilerStdout !== 'Version 7.0.2') {
  const compilerDiagnostic =
    [compilerStdout, compilerStderr, compilerError].find(Boolean) ??
    'no diagnostic output';
  violations.push(
    `node_modules/.bin/tsc must resolve to TypeScript 7.0.2, found "${compilerDiagnostic}".`,
  );
}

const legacyApi = (await import('typescript')) as {
  createSourceFile?: unknown;
  version?: string;
};
if (
  legacyApi.version !== TYPESCRIPT_6_VERSION ||
  typeof legacyApi.createSourceFile !== 'function'
) {
  violations.push(
    `the private TypeScript compiler API must resolve to ${TYPESCRIPT_6_VERSION} with createSourceFile available.`,
  );
}

if (violations.length > 0) {
  console.error('TypeScript toolchain boundary violations found:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(
  `TypeScript toolchain guard passed: 7.0.2 compiler, ${TYPESCRIPT_6_VERSION} API limited to ${LEGACY_API_CONSUMERS.size} manifests.`,
);
