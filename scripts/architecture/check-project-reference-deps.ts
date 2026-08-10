/**
 * Guard TypeScript project references against the Turborepo task graph.
 *
 * `tsc --build` does not only compile the project it is pointed at — it walks
 * `references` and builds every one it considers out of date, writing that
 * project's `dist/` and `tsconfig.tsbuildinfo`. Turbo orders builds from
 * `dependsOn: ["^build"]`, which it derives from **package.json**, not from
 * tsconfig. So a reference with no matching dependency gets no edge, and the
 * two packages build concurrently — two `tsc --build` processes writing the
 * same output directory at the same time.
 *
 * The failure that produced this guard: `packages/client/tsconfig.json`
 * referenced `../helpers/tsconfig.json` while `@genfeedai/client` never
 * depended on (or imported) `@genfeedai/helpers`. `@genfeedai/helpers#build`
 * and `@genfeedai/client#build` ran 1.2s apart in the same wave, and client's
 * compile of the shared reference tree failed with two impossible errors —
 * `IBaseEntity` missing from a barrel that plainly exports it, and `isDeleted`
 * missing from an `IModel` that plainly extends it.
 *
 * It stayed invisible for months because `@genfeedai/client#build` was a Turbo
 * cache hit on every run that mattered; the race only appears on a cache miss,
 * which is to say on the unlucky PR rather than the guilty one. A guard is the
 * only honest way to hold this — the green run tells you nothing.
 *
 * Self-references (a package's own `tsconfig.node.json`, say) carry no
 * cross-package ordering and are exempt.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { globSync } from 'glob';

const TSCONFIG_GLOBS = [
  'apps/**/tsconfig*.json',
  'ee/packages/*/tsconfig*.json',
  'packages/*/tsconfig*.json',
];

const IGNORED_PATHS = ['**/node_modules/**', '**/dist/**', '**/.next/**'];

/** Whole-line `//` comments are the only JSONC this repo's tsconfigs use. */
const LINE_COMMENT = /^\s*\/\/.*$/gm;

export type ReferenceViolation = {
  dependency: string;
  message: string;
  package: string;
  tsconfig: string;
};

function readTsconfig(filePath: string): { references?: { path: string }[] } {
  const raw = readFileSync(filePath, 'utf8').replace(LINE_COMMENT, '');

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${filePath} is not parseable as JSON: ${(error as Error).message}`,
    );
  }
}

/**
 * A reference may point at a tsconfig file or at the directory holding one, and
 * either may sit below the package root, so the owning manifest is whatever
 * package.json is nearest above it.
 */
function findOwningPackage(
  startDirectory: string,
  repositoryRoot: string,
): string | null {
  let current = startDirectory;

  while (current.startsWith(repositoryRoot) && current !== repositoryRoot) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }

    current = dirname(current);
  }

  return null;
}

export function checkProjectReferenceDeps(): ReferenceViolation[] {
  const repositoryRoot = process.cwd();
  const filePaths = globSync(TSCONFIG_GLOBS, {
    ignore: IGNORED_PATHS,
    nodir: true,
  }).sort((left, right) => left.localeCompare(right));

  const violations: ReferenceViolation[] = [];

  for (const filePath of filePaths) {
    const references = readTsconfig(filePath).references ?? [];

    if (references.length === 0) {
      continue;
    }

    const ownerDirectory = findOwningPackage(
      resolve(repositoryRoot, dirname(filePath)),
      repositoryRoot,
    );

    if (!ownerDirectory) {
      continue;
    }

    const owner = JSON.parse(
      readFileSync(join(ownerDirectory, 'package.json'), 'utf8'),
    );
    const declared = new Set([
      ...Object.keys(owner.dependencies ?? {}),
      ...Object.keys(owner.devDependencies ?? {}),
      ...Object.keys(owner.peerDependencies ?? {}),
    ]);

    for (const reference of references) {
      const referenceTarget = resolve(
        repositoryRoot,
        dirname(filePath),
        reference.path,
      );
      const referenceDirectory = referenceTarget.endsWith('.json')
        ? dirname(referenceTarget)
        : referenceTarget;
      const referencedPackage = findOwningPackage(
        referenceDirectory,
        repositoryRoot,
      );

      if (!referencedPackage || referencedPackage === ownerDirectory) {
        continue;
      }

      const referencedName = JSON.parse(
        readFileSync(join(referencedPackage, 'package.json'), 'utf8'),
      ).name;

      if (!referencedName || declared.has(referencedName)) {
        continue;
      }

      violations.push({
        dependency: referencedName,
        message: `${owner.name} references ${relative(repositoryRoot, referencedPackage)} but does not depend on ${referencedName}, so Turbo cannot order the two builds.`,
        package: owner.name,
        tsconfig: filePath,
      });
    }
  }

  return violations;
}

if (import.meta.main) {
  const violations = checkProjectReferenceDeps();

  if (violations.length > 0) {
    console.error('TypeScript project references without a Turbo edge:');

    for (const violation of violations) {
      console.error(`- ${violation.message}`);
      console.error(
        `    ${violation.tsconfig} — add "${violation.dependency}": "workspace:*" to ${violation.package}, or drop the reference if it is unused.`,
      );
    }

    process.exit(1);
  }

  console.log(
    'Project reference guard passed: every cross-package reference has a matching dependency.',
  );
}
