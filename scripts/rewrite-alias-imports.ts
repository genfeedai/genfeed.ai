import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const ROOT_DIR = process.cwd();

const SOURCE_GLOBS = [
  'apps/**/*.{ts,tsx,js,jsx}',
  'packages/**/*.{ts,tsx,js,jsx}',
];

const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
];

const ALLOWED_RELATIVE_IMPORT_FILES = new Set([
  'apps/admin/instrumentation.ts',
  'apps/app/instrumentation.ts',
  'apps/website/instrumentation.ts',
]);

function isAllowedRelativeImportFile(relativePath: string): boolean {
  return (
    ALLOWED_RELATIVE_IMPORT_FILES.has(relativePath) ||
    relativePath.endsWith('/next-env.d.ts')
  );
}

const TSCONFIG_UPDATES: Record<string, Record<string, string[]>> = {
  'apps/server/api/tsconfig.json': {
    '@api-root/*': ['./*'],
    '@api-scripts/*': ['./scripts/*'],
    '@api-test/*': ['./test/*'],
  },
  'packages/agent/tsconfig.json': {
    '@genfeedai/agent': ['./src/index.ts'],
    '@genfeedai/agent/*': ['./src/*'],
  },
  'packages/api-types/tsconfig.json': {
    '@api-types/*': ['./src/*'],
    '@genfeedai/api-types/*': ['./src/*'],
  },
  'packages/helpers/tsconfig.json': {
    '@genfeedai/helpers/*': ['./src/*'],
    '@helpers/*': ['./src/*'],
  },
  'packages/serializers/tsconfig.json': {
    '@serializers/*': ['./src/*'],
  },
  'packages/workflow-cloud/tsconfig.json': {
    '@genfeedai/workflow/*': ['./src/*'],
    '@workflow-cloud/*': ['./src/*'],
  },
  'packages/workflow-engine/tsconfig.json': {
    '@genfeedai/workflow-engine/*': ['./src/*'],
    '@workflow-engine/*': ['./src/*'],
  },
  'packages/workflow-saas/tsconfig.json': {
    '@genfeedai/workflow-saas/*': ['./src/*'],
    '@workflow-saas/*': ['./src/*'],
  },
};

type AliasCandidate = {
  aliasPattern: string;
  resolvedSpecifier: string;
  targetRoot: string;
};

type Replacement = {
  end: number;
  start: number;
  value: string;
};

type TsConfigInfo = {
  pathsBasePath: string;
  paths: Record<string, string[]>;
  tsconfigPath: string;
  workspaceRoot: string;
};

const tsConfigCache = new Map<string, TsConfigInfo>();

function normalizeSlashes(value: string): string {
  return value.split(path.sep).join('/');
}

function ensureTsConfigUpdates() {
  for (const [relativePath, pathUpdates] of Object.entries(TSCONFIG_UPDATES)) {
    const absolutePath = path.join(ROOT_DIR, relativePath);
    const currentJson = JSON.parse(readFileSync(absolutePath, 'utf8')) as {
      compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
      };
    };

    currentJson.compilerOptions ??= {};
    currentJson.compilerOptions.baseUrl ??= '.';
    currentJson.compilerOptions.paths ??= {};

    for (const [alias, targets] of Object.entries(pathUpdates)) {
      currentJson.compilerOptions.paths[alias] = targets;
    }

    writeFileSync(absolutePath, `${JSON.stringify(currentJson, null, 2)}\n`);
  }
}

function findWorkspaceTsConfig(filePath: string): string | null {
  let currentDir = path.dirname(filePath);

  while (currentDir.startsWith(ROOT_DIR)) {
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
      return tsconfigPath;
    }

    if (currentDir === ROOT_DIR) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }

  return null;
}

function getTsConfigInfo(tsconfigPath: string): TsConfigInfo {
  const cached = tsConfigCache.get(tsconfigPath);
  if (cached) {
    return cached;
  }

  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
      },
    },
  );

  if (!parsed) {
    throw new Error(`Failed to parse tsconfig at ${tsconfigPath}`);
  }

  const info: TsConfigInfo = {
    paths: parsed.options.paths ?? {},
    pathsBasePath:
      parsed.options.pathsBasePath ??
      parsed.options.baseUrl ??
      path.dirname(tsconfigPath),
    tsconfigPath,
    workspaceRoot: path.dirname(tsconfigPath),
  };

  tsConfigCache.set(tsconfigPath, info);
  return info;
}

function stripModuleExtension(value: string): string {
  return value.replace(/\.(d\.)?(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/, '');
}

function resolveImportTarget(
  fromFilePath: string,
  specifier: string,
): string | null {
  const basePath = path.resolve(path.dirname(fromFilePath), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mts`,
    `${basePath}.cts`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    `${basePath}.d.ts`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.jsx'),
    path.join(basePath, 'index.mts'),
    path.join(basePath, 'index.cts'),
    path.join(basePath, 'index.mjs'),
    path.join(basePath, 'index.cjs'),
    path.join(basePath, 'index.d.ts'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function createAliasCandidate(
  aliasPattern: string,
  targetPattern: string,
  resolvedTarget: string,
  pathsBasePath: string,
): AliasCandidate | null {
  const aliasHasStar = aliasPattern.includes('*');
  const targetHasStar = targetPattern.includes('*');
  const aliasPrefix = aliasPattern.replace('*', '');
  const targetPrefix = targetPattern.replace('*', '');
  const absoluteTargetPrefix = path.resolve(pathsBasePath, targetPrefix);

  if (targetHasStar) {
    const relativeToTarget = path.relative(
      absoluteTargetPrefix,
      resolvedTarget,
    );
    if (relativeToTarget.startsWith('..')) {
      return null;
    }

    let modulePath = normalizeSlashes(stripModuleExtension(relativeToTarget));
    if (modulePath.endsWith('/index')) {
      modulePath = modulePath.slice(0, -'/index'.length);
    }
    if (modulePath === 'index') {
      modulePath = '';
    }

    return {
      aliasPattern,
      resolvedSpecifier: `${aliasPrefix}${modulePath}`,
      targetRoot: absoluteTargetPrefix,
    };
  }

  const absoluteExactTarget = path.resolve(pathsBasePath, targetPattern);
  if (absoluteExactTarget !== resolvedTarget) {
    return null;
  }

  return {
    aliasPattern,
    resolvedSpecifier: aliasHasStar ? aliasPrefix : aliasPattern,
    targetRoot: absoluteExactTarget,
  };
}

function chooseAliasSpecifier(
  resolvedTarget: string,
  workspace: TsConfigInfo,
): string | null {
  const candidates: AliasCandidate[] = [];
  const targetIsInsideWorkspace = !path
    .relative(workspace.workspaceRoot, resolvedTarget)
    .startsWith('..');

  for (const [aliasPattern, targets] of Object.entries(workspace.paths)) {
    for (const targetPattern of targets) {
      const candidate = createAliasCandidate(
        aliasPattern,
        targetPattern,
        resolvedTarget,
        workspace.pathsBasePath,
      );

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftIsScoped = left.resolvedSpecifier.startsWith('@genfeedai/');
    const rightIsScoped = right.resolvedSpecifier.startsWith('@genfeedai/');

    if (targetIsInsideWorkspace && leftIsScoped !== rightIsScoped) {
      return leftIsScoped ? 1 : -1;
    }

    return left.resolvedSpecifier.length - right.resolvedSpecifier.length;
  });

  return candidates[0]?.resolvedSpecifier ?? null;
}

function getQuoteCharacter(sourceText: string, start: number): string {
  const character = sourceText[start];
  return character === '"' ? '"' : "'";
}

function collectReplacements(
  filePath: string,
  workspace: TsConfigInfo,
): Replacement[] {
  const relativePath = path.relative(ROOT_DIR, filePath);

  if (isAllowedRelativeImportFile(relativePath)) {
    return [];
  }

  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  const replacements: Replacement[] = [];

  const addReplacement = (literal: ts.StringLiteralLike) => {
    const specifier = literal.text;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      return;
    }

    const resolvedTarget = resolveImportTarget(filePath, specifier);
    if (!resolvedTarget) {
      return;
    }

    const aliasSpecifier = chooseAliasSpecifier(resolvedTarget, workspace);
    if (!aliasSpecifier || aliasSpecifier === specifier) {
      return;
    }

    const quoteCharacter = getQuoteCharacter(
      sourceText,
      literal.getStart(sourceFile),
    );

    replacements.push({
      end: literal.getEnd(),
      start: literal.getStart(sourceFile),
      value: `${quoteCharacter}${aliasSpecifier}${quoteCharacter}`,
    });
  };

  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      addReplacement(node.moduleSpecifier);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      addReplacement(node.arguments[0]);
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      addReplacement(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return replacements.sort((left, right) => right.start - left.start);
}

function applyReplacements(
  content: string,
  replacements: Replacement[],
): string {
  let nextContent = content;

  for (const replacement of replacements) {
    nextContent =
      nextContent.slice(0, replacement.start) +
      replacement.value +
      nextContent.slice(replacement.end);
  }

  return nextContent;
}

function main() {
  ensureTsConfigUpdates();

  const files = globSync(SOURCE_GLOBS, {
    absolute: true,
    cwd: ROOT_DIR,
    ignore: IGNORE_GLOBS,
    nodir: true,
  });

  let rewrittenFiles = 0;
  let rewrittenSpecifiers = 0;

  for (const filePath of files) {
    const tsconfigPath = findWorkspaceTsConfig(filePath);
    if (!tsconfigPath) {
      continue;
    }

    const workspace = getTsConfigInfo(tsconfigPath);
    const sourceText = readFileSync(filePath, 'utf8');
    const replacements = collectReplacements(filePath, workspace);

    if (replacements.length === 0) {
      continue;
    }

    const nextContent = applyReplacements(sourceText, replacements);
    if (nextContent === sourceText) {
      continue;
    }

    writeFileSync(filePath, nextContent);
    rewrittenFiles += 1;
    rewrittenSpecifiers += replacements.length;
  }

  console.log(
    `Rewrote ${rewrittenSpecifiers} import specifiers across ${rewrittenFiles} files.`,
  );
}

main();
