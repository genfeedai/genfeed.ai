/**
 * Guard against reporting a terminal `failed` on every attempt (#10803).
 *
 * A BullMQ processor that catches an error and publishes `'failed'` marks the
 * item failed on the first attempt, so a job that succeeds on its retry leaves
 * the item stuck as failed. The files processors did that for videos and
 * YouTube uploads until #10803.
 *
 * In a processor, a call that passes the string `'failed'` from inside a
 * `catch` must sit behind `isFinalAttempt(job)`: in an `if` whose condition
 * calls it, or after an early `if (!isFinalAttempt(job)) return`. A helper
 * that owns the guard (`publishFinalFailure`) keeps the `catch` free of the
 * literal. A call the check cannot place is not reported.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

export type FinalAttemptSource = {
  file: string;
  source: string;
};

export type FinalAttemptViolation = {
  file: string;
  line: number;
  message: string;
};

export type FinalAttemptOptions = {
  ignoreGlobs?: string[];
  rootDir?: string;
  sourceGlobs?: string[];
};

const DEFAULT_SOURCE_GLOBS = ['apps/server/*/src/**/*.processor.ts'];

const DEFAULT_IGNORE_GLOBS = ['**/node_modules/**', '**/*.{spec,test}.ts'];

const GUARD = 'isFinalAttempt';

const FAILED_LITERAL = /['"]failed['"]/u;

export function finalAttemptFix(): string {
  return 'Publish it only on the last attempt: `if (isFinalAttempt(job)) { ... }` (apps/server/files/src/processors/video-processor.util.ts), or report through a helper that starts with `if (!isFinalAttempt(job)) return`.';
}

function mentionsGuard(node: ts.Node): boolean {
  return node.getText().includes(`${GUARD}(`);
}

function isEarlyExit(statement: ts.Statement): boolean {
  const exits = (node: ts.Node): boolean =>
    ts.isReturnStatement(node) ||
    ts.isThrowStatement(node) ||
    (ts.isBlock(node) &&
      node.statements.length > 0 &&
      exits(node.statements[node.statements.length - 1] as ts.Statement));
  return (
    ts.isIfStatement(statement) &&
    mentionsGuard(statement.expression) &&
    exits(statement.thenStatement)
  );
}

/** True when the call only runs on the last attempt. */
function isGuarded(call: ts.CallExpression, boundary: ts.Node): boolean {
  let child: ts.Node = call;
  for (
    let node: ts.Node | undefined = call.parent;
    node && node !== boundary.parent;
    node = node.parent
  ) {
    if (
      ts.isIfStatement(node) &&
      node.thenStatement === child &&
      mentionsGuard(node.expression)
    ) {
      return true;
    }
    if (ts.isBlock(node)) {
      const index = node.statements.indexOf(child as ts.Statement);
      if (node.statements.slice(0, Math.max(index, 0)).some(isEarlyExit)) {
        return true;
      }
    }
    child = node;
  }
  return false;
}

function passesFailedLiteral(call: ts.CallExpression): boolean {
  return call.arguments.some(
    (argument) =>
      ts.isStringLiteralLike(argument) && argument.text === 'failed',
  );
}

function enclosingCatch(node: ts.Node): ts.CatchClause | undefined {
  for (
    let current: ts.Node | undefined = node.parent;
    current;
    current = current.parent
  ) {
    if (
      ts.isFunctionLike(current) ||
      ts.isClassDeclaration(current) ||
      ts.isSourceFile(current)
    ) {
      return undefined;
    }
    if (ts.isCatchClause(current)) return current;
  }
  return undefined;
}

export function findFinalAttemptViolations(
  sources: readonly FinalAttemptSource[],
): FinalAttemptViolation[] {
  const violations: FinalAttemptViolation[] = [];

  for (const { file, source } of sources) {
    if (!FAILED_LITERAL.test(source)) continue;
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && passesFailedLiteral(node)) {
        const catchClause = enclosingCatch(node);
        if (catchClause && !isGuarded(node, catchClause.block)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          violations.push({
            file,
            line: line + 1,
            message: `A catch publishes 'failed' on every attempt, so a job that succeeds on retry stays failed (#10803). ${finalAttemptFix()}`,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
}

export function runFinalAttemptCheck(options: FinalAttemptOptions = {}): {
  scannedFileCount: number;
  violations: FinalAttemptViolation[];
} {
  const rootDir = options.rootDir ?? process.cwd();
  const files = globSync(options.sourceGlobs ?? DEFAULT_SOURCE_GLOBS, {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  })
    .map((file) => file.replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right));

  return {
    scannedFileCount: files.length,
    violations: findFinalAttemptViolations(
      files.map((file) => ({
        file,
        source: readFileSync(path.join(rootDir, file), 'utf8'),
      })),
    ),
  };
}

if (import.meta.main) {
  const rootFlag = process.argv.indexOf('--root');
  const rootDir =
    rootFlag === -1 ? process.cwd() : path.resolve(process.argv[rootFlag + 1]);
  const result = runFinalAttemptCheck({ rootDir });

  if (result.violations.length > 0) {
    console.error('A processor reports failure on every attempt (#10803):');
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file}:${violation.line} ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Final-attempt failure guard passed across ${result.scannedFileCount} processor file(s).`,
  );
}
