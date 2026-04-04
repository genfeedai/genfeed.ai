import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { globSync } from 'glob';
import ts from 'typescript';

const logger = new Logger('CheckStaleTests');

const TEST_GLOBS = [
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.spec.js',
  '**/*.spec.jsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.js',
  '**/*.test.jsx',
];

const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/coverage/**',
  '**/playwright-report/**',
  '**/test-results/**',
];

const TS_CONFIG_CANDIDATES = [
  'tsconfig.test.json',
  'tsconfig.spec.json',
  'tsconfig.json',
  'tsconfig.app.json',
];

const ASSERT_MODULES = new Set(['assert', 'node:assert', 'node:assert/strict']);

const ASSERT_METHODS = new Set([
  'deepEqual',
  'deepStrictEqual',
  'doesNotMatch',
  'doesNotReject',
  'doesNotThrow',
  'equal',
  'fail',
  'ifError',
  'match',
  'notDeepEqual',
  'notDeepStrictEqual',
  'notEqual',
  'notStrictEqual',
  'ok',
  'rejects',
  'strictEqual',
  'throws',
]);

type IssueKind =
  | 'missing-import'
  | 'no-meaningful-assertions'
  | 'trivial-assertions-only';

type MissingImport = {
  line: number;
  specifier: string;
};

type TestFileFinding = {
  file: string;
  issueKinds: IssueKind[];
  missingImports: MissingImport[];
  meaningfulAssertions: number;
  totalAssertions: number;
  trivialAssertions: number;
};

type ScanResult = {
  filesWithMeaningfulAssertions: number;
  filesWithMissingImports: number;
  filesWithNoMeaningfulAssertions: number;
  filesWithTrivialAssertionsOnly: number;
  findings: TestFileFinding[];
  scannedFiles: number;
};

type RunCheckStaleTestsOptions = {
  files?: string[];
};

type CliArgs = {
  files: string[];
  isJson: boolean;
  reportDir: string | null;
};

type CompilerConfig = {
  aliasPrefixes: string[];
  options: ts.CompilerOptions;
};

type ModuleReference = {
  line: number;
  specifier: string;
};

type AssertBindings = {
  callAliases: Set<string>;
  namespaceAliases: Set<string>;
};

const compilerConfigCache = new Map<string, CompilerConfig | null>();

export function runCheckStaleTests(
  options: RunCheckStaleTestsOptions = {},
): ScanResult {
  const rootDir = process.cwd();
  const testFiles = collectTestFiles(rootDir, options.files);
  const findings = testFiles
    .map((filePath) => analyzeTestFile(filePath, rootDir))
    .filter((finding): finding is TestFileFinding => finding !== null);

  return {
    filesWithMeaningfulAssertions:
      testFiles.length -
      findings.filter((finding) => finding.meaningfulAssertions === 0).length,
    filesWithMissingImports: findings.filter((finding) =>
      finding.issueKinds.includes('missing-import'),
    ).length,
    filesWithNoMeaningfulAssertions: findings.filter((finding) =>
      finding.issueKinds.includes('no-meaningful-assertions'),
    ).length,
    filesWithTrivialAssertionsOnly: findings.filter((finding) =>
      finding.issueKinds.includes('trivial-assertions-only'),
    ).length,
    findings,
    scannedFiles: testFiles.length,
  };
}

function collectTestFiles(
  rootDir: string,
  requestedFiles: string[] = [],
): string[] {
  if (requestedFiles.length > 0) {
    return requestedFiles
      .map((filePath) => path.resolve(rootDir, filePath))
      .filter((filePath) => fs.existsSync(filePath))
      .sort();
  }

  const files = globSync(TEST_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: IGNORE_GLOBS,
    nodir: true,
  });

  return [...new Set(files)].sort();
}

function analyzeTestFile(
  filePath: string,
  rootDir: string,
): TestFileFinding | null {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    resolveScriptKind(filePath),
  );
  const compilerConfig = loadCompilerConfig(findNearestTsconfig(filePath));
  const missingImports = collectMissingImports(
    sourceFile,
    filePath,
    compilerConfig,
  );
  const assertionSummary = analyzeAssertions(sourceFile);
  const issueKinds: IssueKind[] = [];

  if (missingImports.length > 0) {
    issueKinds.push('missing-import');
  }

  if (assertionSummary.meaningfulAssertions === 0) {
    if (assertionSummary.trivialAssertions > 0) {
      issueKinds.push('trivial-assertions-only');
    } else {
      issueKinds.push('no-meaningful-assertions');
    }
  }

  if (issueKinds.length === 0) {
    return null;
  }

  return {
    file: toRelativePath(rootDir, filePath),
    issueKinds,
    meaningfulAssertions: assertionSummary.meaningfulAssertions,
    missingImports,
    totalAssertions: assertionSummary.totalAssertions,
    trivialAssertions: assertionSummary.trivialAssertions,
  };
}

function collectMissingImports(
  sourceFile: ts.SourceFile,
  filePath: string,
  compilerConfig: CompilerConfig | null,
): MissingImport[] {
  const moduleReferences = collectModuleReferences(sourceFile);

  return moduleReferences.filter((reference) => {
    if (!isInternalModuleSpecifier(reference.specifier, compilerConfig)) {
      return false;
    }

    if (isKnownAssetImport(reference.specifier)) {
      return false;
    }

    return !resolveModule(reference.specifier, filePath, compilerConfig);
  });
}

function collectModuleReferences(sourceFile: ts.SourceFile): MissingImport[] {
  const references: MissingImport[] = [];
  const seen = new Set<string>();

  function addReference(specifier: string, node: ts.Node): void {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const key = `${specifier}:${line}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    references.push({ line, specifier });
  }

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      addReference(node.moduleSpecifier.text, node.moduleSpecifier);
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      addReference(node.moduleSpecifier.text, node.moduleSpecifier);
    }

    if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      if (isRequireCall(node) || isMockCall(node)) {
        addReference(node.arguments[0].text, node.arguments[0]);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return references;
}

function analyzeAssertions(sourceFile: ts.SourceFile): {
  meaningfulAssertions: number;
  totalAssertions: number;
  trivialAssertions: number;
} {
  const assertBindings = collectAssertBindings(sourceFile);
  let meaningfulAssertions = 0;
  let totalAssertions = 0;
  let trivialAssertions = 0;

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expectAssertion = analyzeExpectAssertion(node);
      if (expectAssertion) {
        totalAssertions += 1;
        if (expectAssertion.isTrivial) {
          trivialAssertions += 1;
        } else {
          meaningfulAssertions += 1;
        }
      } else if (isAssertCall(node, assertBindings)) {
        totalAssertions += 1;
        meaningfulAssertions += 1;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    meaningfulAssertions,
    totalAssertions,
    trivialAssertions,
  };
}

function collectAssertBindings(sourceFile: ts.SourceFile): AssertBindings {
  const callAliases = new Set<string>();
  const namespaceAliases = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }

    if (
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !ASSERT_MODULES.has(statement.moduleSpecifier.text)
    ) {
      continue;
    }

    const importClause = statement.importClause;
    if (!importClause) {
      continue;
    }

    if (importClause.name) {
      callAliases.add(importClause.name.text);
      namespaceAliases.add(importClause.name.text);
    }

    const namedBindings = importClause.namedBindings;
    if (!namedBindings) {
      continue;
    }

    if (ts.isNamespaceImport(namedBindings)) {
      namespaceAliases.add(namedBindings.name.text);
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      const localName = element.name.text;

      if (importedName === 'strict') {
        namespaceAliases.add(localName);
        continue;
      }

      if (ASSERT_METHODS.has(importedName)) {
        callAliases.add(localName);
        continue;
      }

      if (importedName === 'assert') {
        callAliases.add(localName);
        namespaceAliases.add(localName);
      }
    }
  }

  return { callAliases, namespaceAliases };
}

function analyzeExpectAssertion(
  node: ts.CallExpression,
): { isTrivial: boolean } | null {
  const chain = extractCallChain(node.expression);
  const matcherName = chain.properties.at(-1);

  if (
    ts.isIdentifier(chain.root) &&
    chain.root.text === 'expect' &&
    (matcherName === 'assertions' || matcherName === 'hasAssertions')
  ) {
    return { isTrivial: false };
  }

  if (!ts.isCallExpression(chain.root)) {
    return null;
  }

  const rootExpression = unwrapExpression(chain.root.expression);
  if (!ts.isIdentifier(rootExpression)) {
    return null;
  }

  if (
    rootExpression.text !== 'expect' &&
    rootExpression.text !== 'expectTypeOf'
  ) {
    return null;
  }

  if (!chain.properties.some((name) => name.startsWith('to'))) {
    return null;
  }

  if (rootExpression.text === 'expectTypeOf') {
    return { isTrivial: false };
  }

  return {
    isTrivial: isTrivialExpectAssertion(
      chain.root.arguments[0],
      matcherName,
      node.arguments[0],
    ),
  };
}

function isTrivialExpectAssertion(
  actualNode: ts.Expression | undefined,
  matcherName: string | undefined,
  expectedNode: ts.Expression | undefined,
): boolean {
  if (
    !matcherName ||
    !actualNode ||
    !expectedNode ||
    !['toBe', 'toEqual', 'toStrictEqual'].includes(matcherName)
  ) {
    return false;
  }

  const actualSignature = getLiteralSignature(actualNode);
  const expectedSignature = getLiteralSignature(expectedNode);

  return actualSignature !== null && actualSignature === expectedSignature;
}

function isAssertCall(
  node: ts.CallExpression,
  bindings: AssertBindings,
): boolean {
  const expression = unwrapExpression(node.expression);

  if (
    ts.isIdentifier(expression) &&
    bindings.callAliases.has(expression.text)
  ) {
    return true;
  }

  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    bindings.namespaceAliases.has(expression.expression.text)
  ) {
    return ASSERT_METHODS.has(expression.name.text);
  }

  return false;
}

function extractCallChain(expression: ts.Expression): {
  properties: string[];
  root: ts.Expression;
} {
  const properties: string[] = [];
  let current = unwrapExpression(expression);

  while (ts.isPropertyAccessExpression(current)) {
    properties.unshift(current.name.text);
    current = unwrapExpression(current.expression);
  }

  return { properties, root: current };
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function getLiteralSignature(expression: ts.Expression): string | null {
  const value = unwrapExpression(expression);

  if (ts.isStringLiteralLike(value)) {
    return `string:${value.text}`;
  }

  if (ts.isNumericLiteral(value)) {
    return `number:${value.text}`;
  }

  if (ts.isBigIntLiteral(value)) {
    return `bigint:${value.text}`;
  }

  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return 'boolean:true';
  }

  if (value.kind === ts.SyntaxKind.FalseKeyword) {
    return 'boolean:false';
  }

  if (value.kind === ts.SyntaxKind.NullKeyword) {
    return 'null';
  }

  if (ts.isIdentifier(value) && value.text === 'undefined') {
    return 'undefined';
  }

  if (
    ts.isPrefixUnaryExpression(value) &&
    value.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(value.operand)
  ) {
    return `number:-${value.operand.text}`;
  }

  return null;
}

function isRequireCall(node: ts.CallExpression): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === 'require';
}

function isMockCall(node: ts.CallExpression): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    ['doMock', 'mock', 'unstable_mockModule'].includes(
      node.expression.name.text,
    ) &&
    ['jest', 'vi'].includes(node.expression.expression.text)
  );
}

function isInternalModuleSpecifier(
  specifier: string,
  compilerConfig: CompilerConfig | null,
): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return true;
  }

  if (!compilerConfig) {
    return false;
  }

  return compilerConfig.aliasPrefixes.some(
    (prefix) => specifier === prefix || specifier.startsWith(prefix),
  );
}

function isKnownAssetImport(specifier: string): boolean {
  return /\.(css|gif|jpeg|jpg|json|md|mdx|png|scss|svg|webp)$/.test(specifier);
}

function resolveModule(
  specifier: string,
  containingFile: string,
  compilerConfig: CompilerConfig | null,
): boolean {
  const compilerOptions: ts.CompilerOptions = {
    ...(compilerConfig?.options ?? {}),
    allowJs: true,
    jsx: compilerConfig?.options.jsx ?? ts.JsxEmit.Preserve,
    resolveJsonModule: true,
  };
  const resolution = ts.resolveModuleName(
    specifier,
    containingFile,
    compilerOptions,
    ts.sys,
  );

  return resolution.resolvedModule !== undefined;
}

function findNearestTsconfig(filePath: string): string | null {
  let currentDir = path.dirname(filePath);

  while (true) {
    for (const candidateName of TS_CONFIG_CANDIDATES) {
      const candidatePath = path.join(currentDir, candidateName);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function loadCompilerConfig(
  tsconfigPath: string | null,
): CompilerConfig | null {
  if (!tsconfigPath) {
    return null;
  }

  if (compilerConfigCache.has(tsconfigPath)) {
    return compilerConfigCache.get(tsconfigPath) ?? null;
  }

  const configSource = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (configSource.error) {
    compilerConfigCache.set(tsconfigPath, null);
    return null;
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configSource.config,
    ts.sys,
    path.dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  );
  const aliasPrefixes = Object.keys(parsedConfig.options.paths ?? {})
    .map((key) => (key.endsWith('/*') ? key.slice(0, -1) : key))
    .sort((left, right) => right.length - left.length);
  const compilerConfig = {
    aliasPrefixes,
    options: parsedConfig.options,
  };

  compilerConfigCache.set(tsconfigPath, compilerConfig);
  return compilerConfig;
}

function resolveScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }

  if (filePath.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }

  if (filePath.endsWith('.js')) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

function toRelativePath(rootDir: string, targetPath: string): string {
  return path.relative(rootDir, targetPath).replaceAll('\\', '/');
}

function parseCliArgs(argv: string[]): CliArgs {
  const files: string[] = [];
  let isJson = false;
  let reportDir: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      isJson = true;
      continue;
    }

    if (arg === '--report-dir') {
      reportDir = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--files') {
      index += 1;
      while (index < argv.length && !argv[index]?.startsWith('--')) {
        files.push(
          ...argv[index]
            .split(',')
            .map((filePath) => filePath.trim())
            .filter(Boolean),
        );
        index += 1;
      }
      index -= 1;
    }
  }

  return { files, isJson, reportDir };
}

function writeReports(reportDir: string, result: ScanResult): void {
  fs.mkdirSync(reportDir, { recursive: true });

  const jsonPath = path.join(reportDir, 'stale-test-report.json');
  const markdownPath = path.join(reportDir, 'stale-test-report.md');

  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, `${createMarkdownReport(result)}\n`, 'utf8');
}

function createMarkdownReport(result: ScanResult): string {
  const lines = [
    '# Stale Test Report',
    '',
    `- Scanned files: ${result.scannedFiles}`,
    `- Files with missing imports: ${result.filesWithMissingImports}`,
    `- Files with no meaningful assertions: ${result.filesWithNoMeaningfulAssertions}`,
    `- Files with trivial assertions only: ${result.filesWithTrivialAssertionsOnly}`,
    '',
  ];

  if (result.findings.length === 0) {
    lines.push('No stale test issues detected.');
    return lines.join('\n');
  }

  lines.push('| File | Issues | Details |');
  lines.push('| --- | --- | --- |');

  for (const finding of result.findings) {
    const details: string[] = [];

    if (finding.missingImports.length > 0) {
      details.push(
        `missing imports: ${finding.missingImports
          .map(
            (missingImport) =>
              `${missingImport.specifier} (line ${missingImport.line})`,
          )
          .join(', ')}`,
      );
    }

    if (finding.totalAssertions === 0) {
      details.push('no assertions found');
    } else if (finding.meaningfulAssertions === 0) {
      details.push(
        `${finding.trivialAssertions} trivial assertion(s), 0 meaningful`,
      );
    }

    lines.push(
      `| ${finding.file} | ${finding.issueKinds.join(', ')} | ${details.join(
        '<br/>',
      )} |`,
    );
  }

  return lines.join('\n');
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const args = parseCliArgs(process.argv.slice(2));
  const result = runCheckStaleTests({ files: args.files });

  if (args.reportDir) {
    writeReports(path.resolve(process.cwd(), args.reportDir), result);
  }

  if (args.isJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.findings.length > 0 ? 1 : 0);
  }

  if (result.findings.length === 0) {
    logger.log('No stale test issues detected.');
    process.exit(0);
  }

  logger.warn(
    `Detected ${result.findings.length} stale test file(s) across ${result.scannedFiles} scanned test files.`,
  );

  for (const finding of result.findings) {
    const issueSummary = finding.issueKinds.join(', ');
    logger.warn(`- ${finding.file} [${issueSummary}]`);
    for (const missingImport of finding.missingImports) {
      logger.warn(
        `  missing import: ${missingImport.specifier} (line ${missingImport.line})`,
      );
    }
    if (finding.meaningfulAssertions === 0) {
      logger.warn(
        `  assertions: ${finding.totalAssertions} total, ${finding.trivialAssertions} trivial, 0 meaningful`,
      );
    }
  }

  process.exit(1);
}
