import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, unknown> | string;
  name?: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  types?: string;
};

export type TypecheckPrerequisiteViolation = {
  dependency: string;
  expectedPath: string;
};

export type TypecheckPrerequisiteOptions = {
  rootDir?: string;
  workspaceDir?: string;
};

export function isMissingRequiredTurboInvocation(
  arguments_: readonly string[],
  turboHash: string | undefined,
): boolean {
  return arguments_.includes('--require-turbo') && !turboHash;
}

function findRepositoryRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(currentDir, 'turbo.json'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Could not find turbo.json above ${startDir}.`);
    }
    currentDir = parentDir;
  }
}

function readManifest(manifestPath: string): PackageManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest;
}

function declarationTargets(manifest: PackageManifest): string[] {
  const targets = new Set<string>();

  if (manifest.types?.includes('dist/')) {
    targets.add(manifest.types);
  }

  if (!manifest.exports || typeof manifest.exports === 'string') {
    return [...targets];
  }

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }

    for (const [condition, target] of Object.entries(value)) {
      if (
        condition === 'types' &&
        typeof target === 'string' &&
        target.includes('dist/')
      ) {
        targets.add(target);
        continue;
      }
      visit(target);
    }
  };

  visit(manifest.exports);
  return [...targets].sort();
}

function targetExists(packageDir: string, target: string): boolean {
  if (target.includes('*')) {
    const recursivePattern = target.replaceAll('*', '**/*');
    return (
      globSync(recursivePattern, { cwd: packageDir, nodir: true }).length > 0
    );
  }
  return existsSync(path.resolve(packageDir, target));
}

export function checkTypecheckPrerequisites(
  options: TypecheckPrerequisiteOptions = {},
): TypecheckPrerequisiteViolation[] {
  const workspaceDir = path.resolve(options.workspaceDir ?? process.cwd());
  const rootDir = path.resolve(
    options.rootDir ?? findRepositoryRoot(workspaceDir),
  );
  const workspaceManifest = readManifest(
    path.join(workspaceDir, 'package.json'),
  );
  const dependencyNames = new Set([
    ...Object.keys(workspaceManifest.dependencies ?? {}),
    ...Object.keys(workspaceManifest.devDependencies ?? {}),
    ...Object.keys(workspaceManifest.optionalDependencies ?? {}),
    ...Object.keys(workspaceManifest.peerDependencies ?? {}),
  ]);
  const workspaceManifests = globSync(
    ['apps/**/package.json', 'packages/**/package.json'],
    {
      cwd: rootDir,
      ignore: ['**/dist/**', '**/node_modules/**'],
      nodir: true,
    },
  );
  const violations: TypecheckPrerequisiteViolation[] = [];

  for (const manifestPath of workspaceManifests) {
    const dependencyDir = path.dirname(path.join(rootDir, manifestPath));
    const dependencyManifest = readManifest(path.join(rootDir, manifestPath));
    if (
      !dependencyManifest.name ||
      !dependencyNames.has(dependencyManifest.name)
    ) {
      continue;
    }

    for (const target of declarationTargets(dependencyManifest)) {
      if (!targetExists(dependencyDir, target)) {
        violations.push({
          dependency: dependencyManifest.name,
          expectedPath: path.relative(
            rootDir,
            path.resolve(dependencyDir, target),
          ),
        });
      }
    }
  }

  return violations.sort((left, right) =>
    left.dependency.localeCompare(right.dependency),
  );
}

if (import.meta.main) {
  const workspaceManifest = readManifest(
    path.join(process.cwd(), 'package.json'),
  );
  const supportedCommand = `bunx turbo run type-check --filter=${workspaceManifest.name ?? '<workspace>'} --concurrency=1`;

  if (isMissingRequiredTurboInvocation(process.argv, process.env.TURBO_HASH)) {
    console.error(
      'This package typecheck requires Turbo to rebuild its own declarations first.',
    );
    console.error(
      `Run the supported command from the repository root: ${supportedCommand}`,
    );
    process.exit(1);
  }

  const violations = checkTypecheckPrerequisites();

  if (violations.length > 0) {
    console.error('Typecheck prerequisites are not built:');
    for (const violation of violations) {
      console.error(
        `- ${violation.dependency}: missing ${violation.expectedPath}`,
      );
    }
    console.error(
      `Run the supported command from the repository root: ${supportedCommand}`,
    );
    process.exit(1);
  }
}
