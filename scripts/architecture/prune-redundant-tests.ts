import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseSourceFile, scriptKindFor } from './parse-source-file';

export type SmokeCandidate = {
  end: number;
  line: number;
  start: number;
  subject: string;
  title: string;
  witness: string;
  witnessLine: number;
};

export type PruneResult = {
  removed: SmokeCandidate[];
  source: string;
};

type TestCase = {
  body: ts.Block;
  statement: ts.ExpressionStatement;
  title: string;
};

type FileSelection = {
  afterHash: string;
  beforeHash: string;
  file: string;
  removed: SmokeCandidate[];
};

type SelectionManifest = {
  base: string;
  files: FileSelection[];
  lockHash: string;
  parser: string;
  rule: string;
  selectorHash: string;
};

const RULE = 'same-suite-reset-fixture-method-witness-v1';
const PROTECTED_PACKAGES = new Set([
  'agent',
  'contexts',
  'hooks',
  'pages',
  'props',
  'styles',
  'ui',
  'workflows',
]);
const SENSITIVE_PATH =
  /auth|tenant|bill|credit|reserv|payment|stripe|pric|provider|webhook|idempot|generation|postgres|e2e|subscription|invoice|wallet|balance|model|workflow|batch|image|video|music|avatar|speech|integration|\/guards\//iu;

export function isEligibleTestPath(file: string): boolean {
  const segments = file.split('/');
  const isServer =
    segments[0] === 'apps' &&
    segments[1] === 'server' &&
    segments[2] !== 'workers';
  const isPackage =
    segments[0] === 'packages' && !PROTECTED_PACKAGES.has(segments[1] ?? '');
  return (
    (isServer || isPackage) &&
    /\.(?:spec|test)\.[jt]sx?$/u.test(file) &&
    !SENSITIVE_PATH.test(file)
  );
}

function namedCall(node: ts.Node, name: string): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    !node.questionDotToken &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === name
  );
}

function callbackBlock(call: ts.CallExpression): ts.Block | undefined {
  const callback = call.arguments[1];
  if (
    !callback ||
    (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) ||
    (ts.isFunctionExpression(callback) &&
      Boolean(callback.asteriskToken || callback.name)) ||
    callback.parameters.length > 0 ||
    !ts.isBlock(callback.body)
  )
    return undefined;
  return callback.body;
}

function testCase(statement: ts.Statement): TestCase | undefined {
  if (!ts.isExpressionStatement(statement)) return undefined;
  const call = statement.expression;
  if (!namedCall(call, 'it') && !namedCall(call, 'test')) return undefined;
  const title = call.arguments[0];
  const body = callbackBlock(call);
  if (
    !title ||
    !ts.isStringLiteral(title) ||
    !body ||
    call.arguments.length !== 2
  )
    return undefined;
  return { body, statement, title: title.text };
}

function smokeSubject(test: TestCase): string | undefined {
  const statement = test.body.statements[0];
  if (
    test.body.statements.length !== 1 ||
    !statement ||
    !ts.isExpressionStatement(statement)
  )
    return undefined;
  const matcher = statement.expression;
  if (
    !ts.isCallExpression(matcher) ||
    matcher.arguments.length !== 0 ||
    !ts.isPropertyAccessExpression(matcher.expression) ||
    matcher.expression.name.text !== 'toBeDefined'
  )
    return undefined;
  const assertion = matcher.expression.expression;
  if (!namedCall(assertion, 'expect') || assertion.arguments.length !== 1)
    return undefined;
  const subject = assertion.arguments[0];
  return subject && ts.isIdentifier(subject) ? subject.text : undefined;
}

function assignsSubject(node: ts.Node, subject: string): boolean {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(node.left) &&
    node.left.text === subject
  );
}

function bindsSubject(name: ts.BindingName, subject: string): boolean {
  if (ts.isIdentifier(name)) return name.text === subject;
  return name.elements.some(
    (element) =>
      ts.isBindingElement(element) && bindsSubject(element.name, subject),
  );
}

function declaresSubject(node: ts.Node, subject: string): boolean {
  return (
    ((ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      bindsSubject(node.name, subject)) ||
    ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name?.text === subject)
  );
}

const LIFECYCLE_HOOKS = new Set([
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
]);

function conditionalExecution(node: ts.Node): boolean {
  return (
    ts.isReturnStatement(node) ||
    ts.isThrowStatement(node) ||
    ts.isIfStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node) ||
    ts.isIterationStatement(node, false) ||
    ts.isConditionalExpression(node) ||
    ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)) ||
    (ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(node.operatorToken.kind))
  );
}

function mutatesExistingState(node: ts.Node): boolean {
  if (
    !ts.isBinaryExpression(node) ||
    node.operatorToken.kind < ts.SyntaxKind.FirstAssignment ||
    node.operatorToken.kind > ts.SyntaxKind.LastAssignment
  )
    return false;
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return true;
  const target = node.left.getText();
  let selfReference = false;
  function inspect(value: ts.Node): void {
    if (value.getText() === target) selfReference = true;
    ts.forEachChild(value, inspect);
  }
  inspect(node.right);
  return selfReference;
}

function fixtureResets(
  block: ts.Block,
  subject: string,
  scopes: ReadonlyArray<ts.Block | ts.SourceFile>,
): boolean {
  let hasReset = false;
  for (const scope of scopes)
    for (const statement of scope.statements) {
      if (
        !ts.isExpressionStatement(statement) ||
        !ts.isCallExpression(statement.expression) ||
        !ts.isIdentifier(statement.expression.expression) ||
        !LIFECYCLE_HOOKS.has(statement.expression.expression.text)
      )
        continue;
      const call = statement.expression;
      const callback = call.arguments[0];
      if (
        !callback ||
        (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) ||
        !ts.isBlock(callback.body) ||
        (ts.isFunctionExpression(callback) &&
          Boolean(callback.asteriskToken || callback.name)) ||
        callback.parameters.length > 0 ||
        call.questionDotToken
      )
        return false;
      let unsafe = false;
      function inspectSetup(node: ts.Node): void {
        if (declaresSubject(node, subject)) unsafe = true;
        if (ts.isFunctionLike(node)) return;
        if (conditionalExecution(node) || mutatesExistingState(node))
          unsafe = true;
        ts.forEachChild(node, inspectSetup);
      }
      inspectSetup(callback.body);
      if (unsafe) return false;
      if (
        scope === block &&
        namedCall(call, 'beforeEach') &&
        callback.body.statements.some(
          (setup) =>
            ts.isExpressionStatement(setup) &&
            assignsSubject(setup.expression, subject),
        )
      )
        hasReset = true;
    }
  return hasReset;
}

function hasLifecycleAssertions(block: ts.Block | ts.SourceFile): boolean {
  let hasAssertion = false;
  for (const statement of block.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isCallExpression(statement.expression) ||
      !ts.isIdentifier(statement.expression.expression) ||
      !LIFECYCLE_HOOKS.has(statement.expression.expression.text)
    )
      continue;
    function visit(node: ts.Node): void {
      if (namedCall(node, 'expect')) hasAssertion = true;
      ts.forEachChild(node, visit);
    }
    visit(statement);
  }
  return hasAssertion;
}

function isWitness(test: TestCase, subject: string): boolean {
  let hasMethodCall = false;
  let hasAssertion = false;
  let isUnsafe = false;
  function visit(node: ts.Node): void {
    if (conditionalExecution(node)) isUnsafe = true;
    if (declaresSubject(node, subject)) isUnsafe = true;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      isUnsafe = true;
    if (ts.isFunctionLike(node)) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const receiver = node.expression.expression;
      if (
        ts.isIdentifier(receiver) &&
        receiver.text === subject &&
        !node.questionDotToken &&
        !node.expression.questionDotToken
      )
        hasMethodCall = true;
      if (
        namedCall(receiver, 'expect') &&
        node.expression.name.text !== 'toBeDefined'
      )
        hasAssertion = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(test.body);
  return hasMethodCall && hasAssertion && !isUnsafe;
}

export function analyzeSmokeTests(
  file: string,
  source: string,
): SmokeCandidate[] {
  if (!isEligibleTestPath(file)) return [];
  const ast = parseSourceFile(file, source, true, scriptKindFor(file));
  const removed: SmokeCandidate[] = [];
  function visitSuite(
    block: ts.Block,
    scopes: ReadonlyArray<ts.Block | ts.SourceFile>,
  ): void {
    if (hasLifecycleAssertions(block)) return;
    const tests = block.statements
      .map(testCase)
      .filter((test): test is TestCase => test !== undefined);
    for (const test of tests) {
      const subject = smokeSubject(test);
      if (!subject || !fixtureResets(block, subject, scopes)) continue;
      const witness = tests.find(
        (other) => other !== test && isWitness(other, subject),
      );
      if (!witness) continue;
      const position = test.statement.getStart(ast);
      const lineStart = source.lastIndexOf('\n', position - 1) + 1;
      const start =
        source.slice(lineStart, position).trim() === '' ? lineStart : position;
      const trailing = /^[ \t]*\r?\n(?:[ \t]*\r?\n)?/u.exec(
        source.slice(test.statement.end),
      );
      removed.push({
        end: test.statement.end + (trailing?.[0].length ?? 0),
        line: ast.getLineAndCharacterOfPosition(position).line + 1,
        start,
        subject,
        title: test.title,
        witness: witness.title,
        witnessLine:
          ast.getLineAndCharacterOfPosition(witness.statement.getStart(ast))
            .line + 1,
      });
    }
    visitStatements(block.statements, scopes);
  }
  function visitStatements(
    statements: ts.NodeArray<ts.Statement>,
    ancestors: ReadonlyArray<ts.Block | ts.SourceFile>,
  ): void {
    for (const statement of statements) {
      if (
        !ts.isExpressionStatement(statement) ||
        !namedCall(statement.expression, 'describe')
      )
        continue;
      const suite = callbackBlock(statement.expression);
      if (suite) visitSuite(suite, [...ancestors, suite]);
    }
  }
  // Conditional/parameterized registration and imported/custom runner globals are outside this rule.
  let hasCustomBindings = false;
  const globals = new Set([
    'describe',
    'it',
    'test',
    'expect',
    'beforeEach',
    'afterEach',
    'beforeAll',
    'afterAll',
  ]);
  function checkBinding(node: ts.Node): void {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isFunctionDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      globals.has(node.name.text)
    )
      hasCustomBindings = true;
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (node.importClause?.name && globals.has(node.importClause.name.text))
        hasCustomBindings = true;
      const bindings = node.importClause?.namedBindings;
      if (
        bindings &&
        ts.isNamespaceImport(bindings) &&
        globals.has(bindings.name.text)
      )
        hasCustomBindings = true;
      if (
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.some(
          (element) =>
            globals.has(element.name.text) &&
            (node.moduleSpecifier.text !== 'vitest' ||
              (element.propertyName?.text ?? element.name.text) !==
                element.name.text),
        )
      )
        hasCustomBindings = true;
    }
    ts.forEachChild(node, checkBinding);
  }
  checkBinding(ast);
  if (!hasCustomBindings && !hasLifecycleAssertions(ast))
    visitStatements(ast.statements, [ast]);
  return removed.sort((left, right) => left.start - right.start);
}

export function pruneSource(file: string, source: string): PruneResult {
  const removed = analyzeSmokeTests(file, source);
  let result = source;
  for (const candidate of [...removed].reverse())
    result = result.slice(0, candidate.start) + result.slice(candidate.end);
  return { removed, source: result };
}

function hash(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function buildManifest(root: string, baseRef: string): SelectionManifest {
  const base = git(root, [
    'rev-parse',
    '--verify',
    `${baseRef}^{commit}`,
  ]).trim();
  const files: FileSelection[] = [];
  const tracked = git(root, ['ls-tree', '-r', '--name-only', base])
    .trim()
    .split('\n')
    .filter(isEligibleTestPath);
  // One object read avoids thousands of child processes while using only the pinned tree.
  const objects = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: tracked.map((file) => `${base}:${file}\n`).join(''),
    maxBuffer: 256 * 1024 * 1024,
  });
  let offset = 0;
  for (const file of tracked) {
    const newline = objects.indexOf(10, offset);
    const header = objects.subarray(offset, newline).toString('utf8');
    const size = Number(header.split(' ')[2]);
    if (newline < 0 || !Number.isSafeInteger(size) || size < 0)
      throw new Error(`Invalid git object for ${file}`);
    offset = newline + 1;
    const source = objects.subarray(offset, offset + size).toString('utf8');
    offset += size + 1;
    if (!source.includes('toBeDefined')) continue;
    const result = pruneSource(file, source);
    if (result.removed.length > 0)
      files.push({
        afterHash: hash(result.source),
        beforeHash: hash(source),
        file,
        removed: result.removed,
      });
  }
  return {
    base,
    files,
    lockHash: hash(git(root, ['show', `${base}:bun.lock`])),
    parser: ts.version,
    rule: RULE,
    selectorHash: hash(readFileSync(fileURLToPath(import.meta.url), 'utf8')),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const manifestIndex = args.indexOf('--manifest');
  const baseRef = args[baseIndex + 1];
  const manifestPath = args[manifestIndex + 1];
  if (
    baseIndex < 0 ||
    !baseRef ||
    baseRef.startsWith('--') ||
    manifestIndex < 0 ||
    !manifestPath ||
    manifestPath.startsWith('--')
  ) {
    throw new Error(
      'Usage: bun run scripts/architecture/prune-redundant-tests.ts --base <ref> --manifest <file> [--write | --check]',
    );
  }
  if (args.includes('--write') && args.includes('--check'))
    throw new Error('--write and --check are mutually exclusive');
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const manifest = buildManifest(root, baseRef);
  if (args.includes('--check')) {
    const saved: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (JSON.stringify(saved) !== JSON.stringify(manifest))
      throw new Error(
        'Selection manifest does not reproduce from its pinned baseline',
      );
    for (const file of manifest.files) {
      if (
        hash(readFileSync(path.join(root, file.file), 'utf8')) !==
        file.afterHash
      )
        throw new Error(
          `Pruned source does not match its witnessed selection: ${file.file}`,
        );
    }
  } else {
    // Validate every input before any write so drift cannot leave a partially applied selection.
    if (args.includes('--write')) {
      for (const file of manifest.files) {
        const currentHash = hash(
          readFileSync(path.join(root, file.file), 'utf8'),
        );
        if (currentHash !== file.beforeHash && currentHash !== file.afterHash)
          throw new Error(`Source changed since baseline: ${file.file}`);
      }
      for (const file of manifest.files) {
        const source = readFileSync(path.join(root, file.file), 'utf8');
        if (hash(source) === file.afterHash) continue;
        writeFileSync(
          path.join(root, file.file),
          pruneSource(file.file, source).source,
        );
      }
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  process.stdout.write(
    `${JSON.stringify({ files: manifest.files.length, removed: manifest.files.reduce((total, file) => total + file.removed.length, 0), rule: RULE })}\n`,
  );
}

if (import.meta.main) main();
