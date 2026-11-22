/**
 * Guard against outbound HTTP with no timeout (#10820).
 *
 * A provider that stops answering holds the request open for ever, and the
 * database connection, lock or queue slot behind it. #10820 found `HttpModule`
 * imported bare across the API modules and three `fetch` calls with no signal.
 *
 * Two shapes are flagged in server code:
 * - `HttpModule` listed bare in a module's `imports`. Register it with
 *   `HttpModule.register({ timeout })` so every call through `HttpService`
 *   inherits a default.
 * - `HttpModule.register({...})` whose options have no `timeout`, and a
 *   `fetch(url)` or `fetch(url, { ... })` with no `signal`. Pass
 *   `signal: AbortSignal.timeout(ms)`.
 *
 * Options held in a variable or spread into the literal are not followed; a
 * call the check cannot place is not reported. Bare `HttpModule` imports that
 * still stand are listed in `HTTP_TIMEOUT_ALLOWANCES` with the reason; a count
 * that grows or shrinks fails, so the list only gets shorter.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

export type HttpTimeoutSource = {
  file: string;
  source: string;
};

export type HttpTimeoutViolation = {
  file: string;
  line: number;
  message: string;
};

export type HttpTimeoutAllowance = {
  count: number;
  file: string;
  reason: string;
};

export type HttpTimeoutOptions = {
  allowances?: readonly HttpTimeoutAllowance[];
  ignoreGlobs?: string[];
  rootDir?: string;
  sourceGlobs?: string[];
};

const BOT_REASON =
  'The bot manager calls the chat provider and the workflow API through `HttpService` with the axios default (no timeout). Register it with a timeout and check the longest call it makes.';

const PROCESSOR_REASON =
  'Processors download and upload large media through `HttpService`. Register it with a timeout and give the long transfers a longer per-call timeout, as the API does with `UPLOAD_HTTP_TIMEOUT_MS`.';

/** Remaining sites are tracked in the follow-up issue linked from #10855. */
export const HTTP_TIMEOUT_ALLOWANCES: readonly HttpTimeoutAllowance[] = [
  {
    count: 1,
    file: 'apps/server/discord/src/app.module.ts',
    reason: BOT_REASON,
  },
  { count: 1, file: 'apps/server/slack/src/app.module.ts', reason: BOT_REASON },
  {
    count: 1,
    file: 'apps/server/telegram/src/app.module.ts',
    reason: BOT_REASON,
  },
  {
    count: 1,
    file: 'apps/server/files/src/processors/processors.module.ts',
    reason: PROCESSOR_REASON,
  },
  {
    count: 1,
    file: 'apps/server/files/src/shared/shared.module.ts',
    reason: PROCESSOR_REASON,
  },
  {
    count: 1,
    file: 'apps/server/mcp/src/mcp/mcp.module.ts',
    reason:
      'Every MCP tool reaches the API through this client, so a stalled API call holds the tool call open. Register it with a timeout longer than the slowest synchronous tool.',
  },
  {
    count: 1,
    file: 'apps/server/workers/src/services/ads-services.module.ts',
    reason: PROCESSOR_REASON,
  },
  {
    count: 1,
    file: 'apps/server/workers/src/processors/processors.module.ts',
    reason: PROCESSOR_REASON,
  },
  {
    count: 1,
    file: 'apps/server/workers/src/services/generation-services.module.ts',
    reason: PROCESSOR_REASON,
  },
  {
    count: 1,
    file: 'apps/server/workers/src/services/social-integrations.module.ts',
    reason: PROCESSOR_REASON,
  },
];

const DEFAULT_SOURCE_GLOBS = ['apps/server/*/src/**/*.ts'];

const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/test/**',
  '**/*.{spec,test}.ts',
  '**/*.d.ts',
];

const HTTP_MENTION = /\bHttpModule\b|\bfetch\s*\(/u;

const IGNORE_MARKER = 'http-timeout-audit: ignore';

export function httpModuleFix(): string {
  return 'Register it with `HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS })` (apps/server/api/src/constants/http-timeout.constant.ts); a transfer that can outlast it takes a longer `timeout` on the call.';
}

export function fetchFix(): string {
  return 'Pass `signal: AbortSignal.timeout(ms)` in its options.';
}

function hasProperty(
  literal: ts.ObjectLiteralExpression,
  name: string,
): boolean {
  return literal.properties.some(
    (property) =>
      ts.isSpreadAssignment(property) ||
      (property.name !== undefined &&
        (ts.isIdentifier(property.name) ||
          ts.isStringLiteralLike(property.name)) &&
        property.name.text === name),
  );
}

function isHttpModuleRegister(call: ts.CallExpression): boolean {
  const callee = call.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'HttpModule' &&
    callee.name.text === 'register'
  );
}

function isIgnored(source: string, line: number): boolean {
  return (source.split('\n')[line - 2] ?? '').includes(IGNORE_MARKER);
}

export function findHttpTimeoutViolations(
  sources: readonly HttpTimeoutSource[],
): HttpTimeoutViolation[] {
  const violations: HttpTimeoutViolation[] = [];

  for (const { file, source } of sources) {
    if (!HTTP_MENTION.test(source)) continue;
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
    );

    const report = (node: ts.Node, subject: string, fix: string): void => {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(),
      );
      if (isIgnored(source, line + 1)) return;
      violations.push({
        file,
        line: line + 1,
        message: `${subject} has no timeout, so a provider that stops answering holds the request open. ${fix}`,
      });
    };

    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'imports' &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        for (const element of node.initializer.elements) {
          if (ts.isIdentifier(element) && element.text === 'HttpModule') {
            report(element, '`HttpModule` imported bare', httpModuleFix());
          }
        }
      }

      if (ts.isCallExpression(node)) {
        if (isHttpModuleRegister(node)) {
          const options = node.arguments[0];
          if (
            options === undefined ||
            (ts.isObjectLiteralExpression(options) &&
              !hasProperty(options, 'timeout'))
          ) {
            report(
              node,
              '`HttpModule.register` without `timeout`',
              httpModuleFix(),
            );
          }
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'fetch'
        ) {
          const options = node.arguments[1];
          if (
            options === undefined ||
            (ts.isObjectLiteralExpression(options) &&
              !hasProperty(options, 'signal'))
          ) {
            report(node, '`fetch` without `signal`', fetchFix());
          }
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

/** Violations the allowances do not cover, and allowances that no longer match. */
export function applyAllowances(
  violations: readonly HttpTimeoutViolation[],
  allowances: readonly HttpTimeoutAllowance[],
): HttpTimeoutViolation[] {
  const byFile = new Map<string, HttpTimeoutViolation[]>();
  for (const violation of violations) {
    byFile.set(violation.file, [
      ...(byFile.get(violation.file) ?? []),
      violation,
    ]);
  }
  const allowed = new Map(allowances.map((a) => [a.file, a]));

  const remaining: HttpTimeoutViolation[] = [];
  for (const [file, found] of byFile) {
    const allowance = allowed.get(file);
    if (!allowance || found.length > allowance.count) remaining.push(...found);
  }
  for (const allowance of allowances) {
    const found = byFile.get(allowance.file)?.length ?? 0;
    if (found < allowance.count) {
      remaining.push({
        file: allowance.file,
        line: 1,
        message: `HTTP_TIMEOUT_ALLOWANCES lists ${allowance.count} call(s) here but the file has ${found}. Lower the count or delete the entry.`,
      });
    }
  }
  return remaining.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
}

export function runHttpTimeoutCheck(options: HttpTimeoutOptions = {}): {
  scannedFileCount: number;
  violations: HttpTimeoutViolation[];
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
    violations: applyAllowances(
      findHttpTimeoutViolations(
        files.map((file) => ({
          file,
          source: readFileSync(path.join(rootDir, file), 'utf8'),
        })),
      ),
      options.allowances ?? HTTP_TIMEOUT_ALLOWANCES,
    ),
  };
}

if (import.meta.main) {
  const rootFlag = process.argv.indexOf('--root');
  const rootDir =
    rootFlag === -1 ? process.cwd() : path.resolve(process.argv[rootFlag + 1]);
  const result = runHttpTimeoutCheck({ rootDir });

  if (result.violations.length > 0) {
    console.error('Outbound HTTP with no timeout (#10820):');
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file}:${violation.line} ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `HTTP timeout guard passed across ${result.scannedFileCount} file(s).`,
  );
}
