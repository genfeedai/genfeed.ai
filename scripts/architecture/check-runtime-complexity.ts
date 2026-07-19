/**
 * Deterministic structural-complexity guard for production runtime TypeScript.
 *
 * Pull requests scan only files changed from an explicit base ref. The weekly
 * codebase-health workflow runs a report-only full census so the decomposition
 * epic can track existing debt without allowing touched runtime files to grow
 * into new god objects.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const RUNTIME_GLOB = '{apps,ee,packages}/**/*.{cts,mts,ts,tsx}';

const THRESHOLDS = {
  constructorDependencies: 15,
  controllerLines: 500,
  methodLines: 150,
  runtimeLines: 1000,
} as const;

const EXCLUSION_RULES = [
  {
    matches: (file: string) =>
      /(?:^|\/)(?:__fixtures__|fixtures|test-data|testdata)(?:\/|$)/.test(file),
    reason: 'fixture or test-data source',
  },
  {
    matches: (file: string) =>
      /(?:^|\/)(?:generated|migrations)(?:\/|$)/.test(file),
    reason: 'generated or migration source',
  },
  {
    matches: (file: string) =>
      /\.(?:e2e|spec|test|stories)\.(?:cts|mts|ts|tsx)$/.test(file) ||
      file.endsWith('.d.ts'),
    reason: 'test, story, or declaration source',
  },
  {
    matches: (file: string) =>
      /\.(?:config|constants|interface|schema|types)\.(?:cts|mts|ts|tsx)$/.test(
        file,
      ),
    reason: 'declarative-only source',
  },
] as const;

export type RuntimeFileKind = 'controller' | 'runtime';

export type RuntimeComplexityViolation = {
  actual: number;
  file: string;
  kind: RuntimeFileKind;
  limit: number;
  line: number;
  message: string;
  metric: 'constructor-dependencies' | 'file-lines' | 'method-lines';
  symbol: string;
};

export type RuntimeMethodMetric = {
  line: number;
  lines: number;
  symbol: string;
};

export type RuntimeConstructorMetric = {
  dependencies: number;
  line: number;
  symbol: string;
};

export type RuntimeFileMetric = {
  constructors: RuntimeConstructorMetric[];
  file: string;
  kind: RuntimeFileKind;
  lines: number;
  methods: RuntimeMethodMetric[];
};

export type RuntimeComplexityResult = {
  files: RuntimeFileMetric[];
  mode: 'changed' | 'full';
  scannedFileCount: number;
  violations: RuntimeComplexityViolation[];
};

export type RuntimeComplexityOptions = {
  baselineFiles?: readonly RuntimeFileMetric[];
  files: readonly string[];
  mode: 'changed' | 'full';
  rootDir?: string;
  thresholds?: Partial<RuntimeThresholds>;
};

export type ChangedRuntimeFilesOptions = {
  baseRef: string;
  headRef?: string;
  rootDir?: string;
};

type RuntimeThresholds = {
  constructorDependencies: number;
  controllerLines: number;
  methodLines: number;
  runtimeLines: number;
};

function normalize(file: string): string {
  return file.replaceAll('\\', '/').replace(/^\.\//, '');
}

function exclusionReason(file: string): string | null {
  for (const rule of EXCLUSION_RULES) {
    if (rule.matches(file)) {
      return rule.reason;
    }
  }
  return null;
}

function classifyRuntimeFile(file: string): RuntimeFileKind | null {
  if (/\.controller\.(?:cts|mts|ts|tsx)$/.test(file)) {
    return 'controller';
  }
  if (
    /\.(?:gateway|processor|resolver|service)\.(?:cts|mts|ts|tsx)$/.test(file)
  ) {
    return 'runtime';
  }
  return null;
}

function countPhysicalLines(contents: string): number {
  if (contents.length === 0) {
    return 0;
  }
  const lines = contents.split(/\r\n|\n|\r/);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines.length;
}

function nodeLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function nodeSpan(sourceFile: ts.SourceFile, node: ts.Node): number {
  const start = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  ).line;
  const end = sourceFile.getLineAndCharacterOfPosition(node.end).line;
  return end - start + 1;
}

function className(node: ts.ClassLikeDeclaration): string {
  return node.name?.text ?? '<anonymous class>';
}

function memberName(
  sourceFile: ts.SourceFile,
  member: ts.MethodDeclaration,
): string {
  return member.name.getText(sourceFile);
}

function measureContents(
  contents: string,
  relativeFile: string,
  kind: RuntimeFileKind,
): RuntimeFileMetric {
  const sourceFile = ts.createSourceFile(
    relativeFile,
    contents,
    ts.ScriptTarget.Latest,
    true,
    relativeFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const constructors: RuntimeConstructorMetric[] = [];
  const methods: RuntimeMethodMetric[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const owner = className(node);
      for (const member of node.members) {
        if (ts.isConstructorDeclaration(member)) {
          constructors.push({
            dependencies: member.parameters.length,
            line: nodeLine(sourceFile, member),
            symbol: `${owner}.constructor`,
          });
          continue;
        }
        if (ts.isMethodDeclaration(member) && member.body) {
          methods.push({
            line: nodeLine(sourceFile, member),
            lines: nodeSpan(sourceFile, member),
            symbol: `${owner}.${memberName(sourceFile, member)}`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    constructors: constructors.sort(
      (left, right) =>
        left.line - right.line || left.symbol.localeCompare(right.symbol),
    ),
    file: relativeFile,
    kind,
    lines: countPhysicalLines(contents),
    methods: methods.sort(
      (left, right) =>
        left.line - right.line || left.symbol.localeCompare(right.symbol),
    ),
  };
}

function measureFile(
  absoluteFile: string,
  relativeFile: string,
  kind: RuntimeFileKind,
): RuntimeFileMetric {
  return measureContents(
    readFileSync(absoluteFile, 'utf8'),
    relativeFile,
    kind,
  );
}

function violationsForFile(
  file: RuntimeFileMetric,
  thresholds: RuntimeThresholds,
): RuntimeComplexityViolation[] {
  const violations: RuntimeComplexityViolation[] = [];
  const fileLimit =
    file.kind === 'controller'
      ? thresholds.controllerLines
      : thresholds.runtimeLines;

  if (file.lines > fileLimit) {
    violations.push({
      actual: file.lines,
      file: file.file,
      kind: file.kind,
      limit: fileLimit,
      line: 1,
      message: `${file.kind} has ${file.lines} physical lines (limit ${fileLimit})`,
      metric: 'file-lines',
      symbol: file.file,
    });
  }

  for (const method of file.methods) {
    if (method.lines <= thresholds.methodLines) {
      continue;
    }
    violations.push({
      actual: method.lines,
      file: file.file,
      kind: file.kind,
      limit: thresholds.methodLines,
      line: method.line,
      message: `${method.symbol} spans ${method.lines} lines (limit ${thresholds.methodLines})`,
      metric: 'method-lines',
      symbol: method.symbol,
    });
  }

  for (const constructor of file.constructors) {
    if (constructor.dependencies <= thresholds.constructorDependencies) {
      continue;
    }
    violations.push({
      actual: constructor.dependencies,
      file: file.file,
      kind: file.kind,
      limit: thresholds.constructorDependencies,
      line: constructor.line,
      message: `${constructor.symbol} has ${constructor.dependencies} dependencies (limit ${thresholds.constructorDependencies})`,
      metric: 'constructor-dependencies',
      symbol: constructor.symbol,
    });
  }

  return violations;
}

type RuntimeMetricCeiling = {
  actual: number;
  file: string;
  metric: RuntimeComplexityViolation['metric'];
  symbol: string;
};

function metricCeilings(
  files: readonly RuntimeFileMetric[],
): RuntimeMetricCeiling[] {
  return files.flatMap((file) => [
    {
      actual: file.lines,
      file: file.file,
      metric: 'file-lines' as const,
      symbol: file.file,
    },
    ...file.methods.map((method) => ({
      actual: method.lines,
      file: file.file,
      metric: 'method-lines' as const,
      symbol: method.symbol,
    })),
    ...file.constructors.map((constructor) => ({
      actual: constructor.dependencies,
      file: file.file,
      metric: 'constructor-dependencies' as const,
      symbol: constructor.symbol,
    })),
  ]);
}

function filterComplexityRegressions(
  violations: readonly RuntimeComplexityViolation[],
  baselineFiles: readonly RuntimeFileMetric[],
): RuntimeComplexityViolation[] {
  const remainingCeilings = metricCeilings(baselineFiles);

  return violations.filter((violation) => {
    const exactIndex = remainingCeilings.findIndex(
      (ceiling) =>
        ceiling.file === violation.file &&
        ceiling.metric === violation.metric &&
        ceiling.symbol === violation.symbol,
    );
    if (exactIndex >= 0) {
      const [ceiling] = remainingCeilings.splice(exactIndex, 1);
      return violation.actual > ceiling.actual;
    }

    const renamedIndex = remainingCeilings
      .map((ceiling, index) => ({ ceiling, index }))
      .filter(
        ({ ceiling }) =>
          ceiling.file === violation.file &&
          ceiling.metric === violation.metric &&
          ceiling.actual >= violation.actual,
      )
      .sort(
        (left, right) =>
          left.ceiling.actual - right.ceiling.actual ||
          left.ceiling.symbol.localeCompare(right.ceiling.symbol),
      )[0]?.index;
    if (renamedIndex === undefined) {
      return true;
    }

    remainingCeilings.splice(renamedIndex, 1);
    return false;
  });
}

export function runRuntimeComplexityCheck(
  options: RuntimeComplexityOptions,
): RuntimeComplexityResult {
  const rootDir = options.rootDir ?? process.cwd();
  const thresholds: RuntimeThresholds = {
    ...THRESHOLDS,
    ...options.thresholds,
  };
  const uniqueFiles = [
    ...new Set(
      options.files.map((file) =>
        normalize(path.relative(rootDir, path.resolve(rootDir, file))),
      ),
    ),
  ].sort();
  const files: RuntimeFileMetric[] = [];

  for (const relativeFile of uniqueFiles) {
    if (
      !/^(?:apps|ee|packages)\//.test(relativeFile) ||
      exclusionReason(relativeFile)
    ) {
      continue;
    }
    const kind = classifyRuntimeFile(relativeFile);
    if (!kind) {
      continue;
    }
    const absoluteFile = path.join(rootDir, relativeFile);
    if (!existsSync(absoluteFile)) {
      // Deleted paths can appear in a caller-provided changed-file list.
      continue;
    }
    files.push(measureFile(absoluteFile, relativeFile, kind));
  }

  const measuredViolations = files
    .flatMap((file) => violationsForFile(file, thresholds))
    .sort(
      (left, right) =>
        left.file.localeCompare(right.file) ||
        left.line - right.line ||
        left.metric.localeCompare(right.metric),
    );
  const violations =
    options.mode === 'changed' && options.baselineFiles
      ? filterComplexityRegressions(measuredViolations, options.baselineFiles)
      : measuredViolations;

  return {
    files,
    mode: options.mode,
    scannedFileCount: files.length,
    violations,
  };
}

export function measureRuntimeFilesAtRef(options: {
  baseRef: string;
  files: readonly string[];
  rootDir?: string;
}): RuntimeFileMetric[] {
  const rootDir = options.rootDir ?? process.cwd();
  const metrics: RuntimeFileMetric[] = [];

  for (const file of [...new Set(options.files.map(normalize))].sort()) {
    if (exclusionReason(file)) {
      continue;
    }
    const kind = classifyRuntimeFile(file);
    if (!kind) {
      continue;
    }
    const result = spawnSync('git', ['show', `${options.baseRef}:${file}`], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      continue;
    }
    metrics.push(measureContents(result.stdout, file, kind));
  }

  return metrics;
}

export function discoverFullRuntimeFiles(rootDir = process.cwd()): string[] {
  return globSync(RUNTIME_GLOB, {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**'],
    nodir: true,
  }).sort();
}

export function discoverChangedRuntimeFiles(
  options: ChangedRuntimeFilesOptions,
): string[] {
  const rootDir = options.rootDir ?? process.cwd();
  const result = spawnSync(
    'git',
    [
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      options.baseRef,
      options.headRef ?? 'HEAD',
      '--',
      'apps',
      'ee',
      'packages',
    ],
    { cwd: rootDir, encoding: 'utf8' },
  );

  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message || result.stderr.trim() || 'unknown git error';
    throw new Error(
      `Unable to discover changed runtime files from ${options.baseRef}: ${detail}`,
    );
  }

  return result.stdout.split('\n').map(normalize).filter(Boolean).sort();
}

type CliOptions = {
  allowViolations: boolean;
  baseRef: string | null;
  json: boolean;
  mode: 'changed' | 'full' | null;
  output: string | null;
};

function parseCliOptions(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    allowViolations: false,
    baseRef: null,
    json: false,
    mode: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-violations') {
      options.allowViolations = true;
      continue;
    }
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--full') {
      if (options.mode && options.mode !== 'full') {
        throw new Error('--full and --base are mutually exclusive');
      }
      options.mode = 'full';
      continue;
    }
    if (argument === '--base') {
      if (options.mode && options.mode !== 'changed') {
        throw new Error('--full and --base are mutually exclusive');
      }
      options.mode = 'changed';
      options.baseRef = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (argument === '--output') {
      options.output = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.mode) {
    throw new Error('Specify exactly one mode: --base <git-ref> or --full');
  }
  if (options.mode === 'changed' && !options.baseRef) {
    throw new Error('--base requires a git ref');
  }
  return options;
}

function reportHuman(result: RuntimeComplexityResult): void {
  const summary = `Runtime complexity ${result.mode} scan: ${result.scannedFileCount} classified file(s), ${result.violations.length} violation(s).`;
  if (result.violations.length === 0) {
    console.log(summary);
    return;
  }

  console.error(summary);
  for (const violation of result.violations) {
    console.error(
      `- ${violation.file}:${violation.line} [${violation.metric}] ${violation.message}`,
    );
  }
}

function main(): void {
  let options: CliOptions;
  try {
    options = parseCliOptions(process.argv.slice(2));
  } catch (error) {
    console.error(
      `check:runtime-complexity — ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }

  const rootDir = process.cwd();
  let files: string[];
  try {
    files =
      options.mode === 'full'
        ? discoverFullRuntimeFiles(rootDir)
        : discoverChangedRuntimeFiles({
            baseRef: options.baseRef as string,
            rootDir,
          });
  } catch (error) {
    console.error(
      `check:runtime-complexity — ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }

  const result = runRuntimeComplexityCheck({
    baselineFiles:
      options.mode === 'changed'
        ? measureRuntimeFilesAtRef({
            baseRef: options.baseRef as string,
            files,
            rootDir,
          })
        : undefined,
    files,
    mode: options.mode,
    rootDir,
  });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;

  if (options.output) {
    writeFileSync(path.resolve(rootDir, options.output), serialized, 'utf8');
  }
  if (options.json) {
    process.stdout.write(serialized);
  } else {
    reportHuman(result);
  }

  if (result.violations.length > 0 && !options.allowViolations) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
