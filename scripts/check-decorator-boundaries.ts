import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const ROOT_DIR = process.cwd();
const SHARED_SERVER_DECORATOR_TSCONFIG = path.resolve(
  ROOT_DIR,
  'tsconfig.server.decorators.json',
);

const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/__tests__/**',
];

const ALLOWED_NEST_PACKAGE_ROOTS = new Set(['packages/libs']);

type ProjectInfo = {
  kind: 'package' | 'server-app';
  rootRelativePath: string;
  tsconfigRelativePath: string;
};

type SourceSignals = {
  sampleDecoratorFile?: string;
  sampleNestImportFile?: string;
};

type Violation = {
  details: string;
  project: string;
};

function readJsonFile(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function resolveExtendsPath(
  tsconfigPath: string,
  extendsValue: unknown,
): string | null {
  if (typeof extendsValue !== 'string' || !extendsValue.startsWith('.')) {
    return null;
  }

  const candidate = path.resolve(path.dirname(tsconfigPath), extendsValue);
  const normalized = candidate.endsWith('.json')
    ? candidate
    : `${candidate}.json`;

  return existsSync(normalized) ? normalized : null;
}

function extendsSharedServerDecoratorConfig(tsconfigPath: string): boolean {
  let currentPath: string | null = tsconfigPath;
  const visited = new Set<string>();

  while (currentPath && !visited.has(currentPath)) {
    visited.add(currentPath);

    if (path.resolve(currentPath) === SHARED_SERVER_DECORATOR_TSCONFIG) {
      return true;
    }

    const config = readJsonFile(currentPath);
    currentPath = resolveExtendsPath(currentPath, config.extends);
  }

  return false;
}

function hasDecorators(sourceFile: ts.SourceFile): boolean {
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }

    if (
      ts.canHaveDecorators(node) &&
      (ts.getDecorators(node)?.length ?? 0) > 0
    ) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return found;
}

function collectSourceSignals(projectRoot: string): SourceSignals {
  const sourceFiles = globSync(`${projectRoot}/**/*.{ts,tsx}`, {
    absolute: true,
    cwd: ROOT_DIR,
    ignore: IGNORE_GLOBS,
    nodir: true,
  });

  const signals: SourceSignals = {};

  for (const filePath of sourceFiles) {
    const sourceText = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
    );

    if (!signals.sampleNestImportFile) {
      for (const statement of sourceFile.statements) {
        if (
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteralLike(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text.startsWith('@nestjs/')
        ) {
          signals.sampleNestImportFile = path.relative(ROOT_DIR, filePath);
          break;
        }
      }
    }

    if (!signals.sampleDecoratorFile && hasDecorators(sourceFile)) {
      signals.sampleDecoratorFile = path.relative(ROOT_DIR, filePath);
    }

    if (signals.sampleNestImportFile && signals.sampleDecoratorFile) {
      break;
    }
  }

  return signals;
}

function collectProjects(): ProjectInfo[] {
  const packageProjects = globSync('packages/*/tsconfig.json', {
    absolute: false,
    cwd: ROOT_DIR,
    nodir: true,
  }).map((tsconfigRelativePath) => ({
    kind: 'package' as const,
    rootRelativePath: path.dirname(tsconfigRelativePath),
    tsconfigRelativePath,
  }));

  const serverProjects = globSync('apps/server/*/tsconfig.json', {
    absolute: false,
    cwd: ROOT_DIR,
    nodir: true,
  }).map((tsconfigRelativePath) => ({
    kind: 'server-app' as const,
    rootRelativePath: path.dirname(tsconfigRelativePath),
    tsconfigRelativePath,
  }));

  return [...packageProjects, ...serverProjects];
}

function main(): void {
  const violations: Violation[] = [];

  if (
    !extendsSharedServerDecoratorConfig(
      path.resolve('apps/server/tsconfig.json'),
    )
  ) {
    violations.push({
      details:
        'apps/server/tsconfig.json must extend the shared server-decorator tsconfig.',
      project: 'apps/server',
    });
  }

  for (const project of collectProjects()) {
    const tsconfigPath = path.resolve(ROOT_DIR, project.tsconfigRelativePath);
    const signals = collectSourceSignals(project.rootRelativePath);
    const usesNest = Boolean(signals.sampleNestImportFile);
    const usesDecorators = Boolean(signals.sampleDecoratorFile);
    const usesServerDecoratorMode =
      extendsSharedServerDecoratorConfig(tsconfigPath);

    if ((usesNest || usesDecorators) && !usesServerDecoratorMode) {
      const evidence =
        signals.sampleNestImportFile ??
        signals.sampleDecoratorFile ??
        'unknown file';

      violations.push({
        details: `uses Nest imports or decorators in ${evidence} but its tsconfig chain does not include tsconfig.server.decorators.json.`,
        project: project.rootRelativePath,
      });
    }

    if (
      project.kind === 'package' &&
      usesNest &&
      !ALLOWED_NEST_PACKAGE_ROOTS.has(project.rootRelativePath)
    ) {
      violations.push({
        details: `has an unauthorized Nest dependency in ${signals.sampleNestImportFile}. Shared packages should stay framework-agnostic unless explicitly server-scoped.`,
        project: project.rootRelativePath,
      });
    }
  }

  if (violations.length > 0) {
    console.error(
      'Decorator boundary violations found. Keep Nest legacy decorators contained to server apps and explicitly server-scoped packages.',
    );

    for (const violation of violations) {
      console.error(`- ${violation.project}: ${violation.details}`);
    }

    process.exit(1);
  }

  console.log(
    'Decorator boundaries look good. Nest-bearing projects inherit the shared server-decorator tsconfig and framework-agnostic packages remain clean.',
  );
}

main();
