/**
 * Guard against `window.open` after an `await` (#10823).
 *
 * A browser allows a new tab only while the click that asked for it is still
 * the active user gesture. An `await` (or a `.then` callback) ends that
 * gesture, so a `window.open` after it is swallowed by the popup blocker and
 * the button does nothing. The billing portal, the avatar twin link and the
 * replies warm-up link all shipped that way before #10823.
 *
 * The fix is to open the tab first and point it at the URL once the request
 * resolves (`openInNewTab` in `@/lib/navigation/open-in-new-tab`), or to
 * navigate the current tab with `'_self'`, which is not a popup.
 *
 * A call that is safe for a reason the check cannot see takes
 * `// window-open-audit: ignore <reason>` on the line above. Sites that are
 * still wrong are listed in `WINDOW_OPEN_ALLOWANCES` with the number of calls
 * and why they stay; a count that grows or shrinks fails, so the list only
 * gets shorter.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

export type WindowOpenSource = {
  file: string;
  source: string;
};

export type WindowOpenViolation = {
  file: string;
  line: number;
  message: string;
};

export type WindowOpenAllowance = {
  count: number;
  file: string;
  reason: string;
};

export type WindowOpenOptions = {
  allowances?: readonly WindowOpenAllowance[];
  ignoreGlobs?: string[];
  rootDir?: string;
  sourceGlobs?: string[];
};

const EXTENSION_TAB_FALLBACK =
  'Fallback that runs only after `chrome.tabs.create` rejected; there is no earlier tab to open and `chrome.tabs.create` is not subject to the popup blocker. Delete the fallback.';

/** Remaining sites, with their fixes, are tracked in #10857. */
export const WINDOW_OPEN_ALLOWANCES: readonly WindowOpenAllowance[] = [
  {
    count: 1,
    file: 'apps/extension/src/components/pages/ImportedSourcesPage.tsx',
    reason: EXTENSION_TAB_FALLBACK,
  },
  {
    count: 1,
    file: 'apps/extension/src/components/pages/LoginPage.tsx',
    reason: EXTENSION_TAB_FALLBACK,
  },
  {
    count: 1,
    file: 'apps/extension/src/sidepanel.tsx',
    reason: EXTENSION_TAB_FALLBACK,
  },
  {
    count: 4,
    file: 'apps/extension/src/platforms/reply-media.ts',
    reason:
      'The content script opens the generated media 30 to 60 seconds after the click, so the browser always blocks it. Route it through the background script (`chrome.tabs.create`).',
  },
  {
    count: 1,
    file: 'packages/workflows/src/ui/nodes/output/OutputNode.tsx',
    reason:
      'Last-resort open after the download fetch failed; the fetch of one file usually finishes inside the click. Replace it with a visible "open file" link.',
  },
];

const DEFAULT_SOURCE_GLOBS = ['{apps,packages}/**/*.{ts,tsx}'];

const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/*.{spec,test}.{ts,tsx}',
  '**/*.d.ts',
];

const WINDOW_OPEN_MENTION = /\b(?:window|globalThis)\s*\.\s*open\b/u;

const IGNORE_MARKER = 'window-open-audit: ignore';

/** A target that replaces the current tab; it is not a popup. */
const SAME_TAB_TARGETS = new Set(['_self', '_top', '_parent']);

const PROMISE_CALLBACK_METHODS = new Set(['catch', 'finally', 'then']);

export function windowOpenFix(): string {
  return "Open the tab first and point it at the URL afterwards: `await openInNewTab(async () => url)` from '@/lib/navigation/open-in-new-tab'. To leave the current page instead, pass '_self'.";
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function isWindowOpenCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'open' &&
    ts.isIdentifier(callee.expression) &&
    (callee.expression.text === 'window' ||
      callee.expression.text === 'globalThis')
  );
}

function opensInCurrentTab(call: ts.CallExpression): boolean {
  const target = call.arguments[1];
  return (
    target !== undefined &&
    ts.isStringLiteralLike(target) &&
    SAME_TAB_TARGETS.has(target.text)
  );
}

/** True when the function is the callback of `.then`, `.catch` or `.finally`. */
function isPromiseCallback(fn: ts.Node): boolean {
  const call = fn.parent;
  return (
    ts.isCallExpression(call) &&
    call.arguments.includes(fn as ts.Expression) &&
    ts.isPropertyAccessExpression(call.expression) &&
    PROMISE_CALLBACK_METHODS.has(call.expression.name.text)
  );
}

type Body = {
  awaits: ts.Node[];
  opens: ts.CallExpression[];
};

/** What one function runs itself, not what its nested functions run. */
function collectBody(fn: ts.FunctionLikeDeclaration): Body {
  const body: Body = { awaits: [], opens: [] };
  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node)) return;
    if (ts.isAwaitExpression(node)) body.awaits.push(node);
    if (ts.isForOfStatement(node) && node.awaitModifier) body.awaits.push(node);
    if (isWindowOpenCall(node)) body.opens.push(node);
    ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return body;
}

function isIgnored(source: string, line: number): boolean {
  const lines = source.split('\n');
  return (lines[line - 2] ?? '').includes(IGNORE_MARKER);
}

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function precedes(await_: ts.Node, call: ts.CallExpression): boolean {
  // An `await` that wraps the call itself finishes after it opened the tab.
  if (
    ts.isAwaitExpression(await_) &&
    await_.getStart() <= call.getStart() &&
    await_.end >= call.end
  ) {
    return false;
  }
  return await_.getStart() < call.end;
}

export function findWindowOpenAfterAwaitViolations(
  sources: readonly WindowOpenSource[],
): WindowOpenViolation[] {
  const violations: WindowOpenViolation[] = [];

  for (const { file, source } of sources) {
    if (!WINDOW_OPEN_MENTION.test(source)) continue;
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(file),
    );

    const report = (call: ts.CallExpression, reason: string): void => {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        call.getStart(),
      );
      if (isIgnored(source, line + 1)) return;
      violations.push({
        file,
        line: line + 1,
        message: `window.open ${reason}, outside the click, so a popup blocker blocks it. ${windowOpenFix()}`,
      });
    };

    const visit = (node: ts.Node): void => {
      if (isFunctionLike(node)) {
        const body = collectBody(node);
        const deferred = isPromiseCallback(node);
        for (const call of body.opens) {
          if (opensInCurrentTab(call)) continue;
          if (deferred) {
            report(call, 'runs in a promise callback');
          } else if (body.awaits.some((a) => precedes(a, call))) {
            report(call, 'runs after an await');
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
  violations: readonly WindowOpenViolation[],
  allowances: readonly WindowOpenAllowance[],
): WindowOpenViolation[] {
  const byFile = new Map<string, WindowOpenViolation[]>();
  for (const violation of violations) {
    byFile.set(violation.file, [
      ...(byFile.get(violation.file) ?? []),
      violation,
    ]);
  }
  const allowed = new Map(allowances.map((a) => [a.file, a]));

  const remaining: WindowOpenViolation[] = [];
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
        message: `WINDOW_OPEN_ALLOWANCES lists ${allowance.count} call(s) here but the file has ${found}. Lower the count or delete the entry.`,
      });
    }
  }
  return remaining.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
}

export function runWindowOpenCheck(options: WindowOpenOptions = {}): {
  scannedFileCount: number;
  violations: WindowOpenViolation[];
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
      findWindowOpenAfterAwaitViolations(
        files.map((file) => ({
          file,
          source: readFileSync(path.join(rootDir, file), 'utf8'),
        })),
      ),
      options.allowances ?? WINDOW_OPEN_ALLOWANCES,
    ),
  };
}

if (import.meta.main) {
  const rootFlag = process.argv.indexOf('--root');
  const rootDir =
    rootFlag === -1 ? process.cwd() : path.resolve(process.argv[rootFlag + 1]);
  const result = runWindowOpenCheck({ rootDir });

  if (result.violations.length > 0) {
    console.error('window.open after an await is blocked as a popup (#10823):');
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file}:${violation.line} ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `window.open guard passed across ${result.scannedFileCount} file(s).`,
  );
}
