/**
 * `useEffect` is a shrinking ratchet, and an async effect must carry an abort.
 *
 * Why: effects that sync state to state, fetch on mount, or react to props are
 * the usual source of render loops, stale responses and double fetches. Derive
 * the value during render, run the work in the event handler that caused it,
 * read external stores with `useSyncExternalStore`, or use a data hook. An
 * effect stays right only for subscribing to a system outside React.
 *
 * Two kinds are counted per production file, against `use-effect.baseline.json`:
 *
 *   use_effect                  every `useEffect(` / `React.useEffect(` call
 *   async_effect_without_abort  an effect callback that awaits, calls `.then`
 *                               or `fetch`, and never mentions AbortController,
 *                               AbortSignal or `signal` (AGENTS.md Enforced Rules)
 *
 * Counts may only go down. A new file, or a file whose count rises, fails. A
 * file whose count falls fails until its baseline entry is pruned in the same
 * PR (`--update-baseline`). `check:ratchet-growth` also fails a PR that grows
 * the baseline against its base.
 *
 * The async check is syntactic: it sees `await`, `.then(` and `fetch(` inside
 * the callback. An effect that calls an async function it did not define there
 * is not detected, because that needs types.
 *
 * An effect that must exist (subscribing to a system outside React) carries
 * `// use-effect-audit: ignore <reason>` on the line above the call. The reason
 * is required and is not counted in either kind.
 *
 *   bun run check:use-effect
 *   bun run check:use-effect --update-baseline   # shrink only
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import * as ts from 'typescript';
import { parseSourceFile, scriptKindFor } from './parse-source-file';

export const EFFECT_KINDS = [
  'use_effect',
  'async_effect_without_abort',
] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number];

export type EffectFinding = {
  file: string;
  kind: EffectKind;
  line: number;
};

export type EffectCounts = Record<EffectKind, Record<string, number>>;

export type EffectViolation = {
  actual: number;
  baseline: number;
  file: string;
  kind: EffectKind;
  type: 'growth' | 'new_file' | 'stale_baseline';
};

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASELINE_PATH = path.join(
  ROOT,
  'scripts/architecture/use-effect.baseline.json',
);

const INCLUDE_GLOBS = ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'];

const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/generated/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/*.d.ts',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.stories.tsx',
  '**/__tests__/**',
  '**/tests/**',
  '**/__fixtures__/**',
  '**/fixtures/**',
];

const AUDIT_IGNORE_PATTERN = /^\s*\/\/\s*use-effect-audit:\s*ignore\s+\S+/;
const ABORT_IDENTIFIERS = new Set(['AbortController', 'AbortSignal', 'signal']);

type ReactBindings = {
  /** Local names bound to react's `useEffect`, so `import { useEffect as run }` is seen. */
  effectNames: Set<string>;
  /** Local names bound to the whole react module: `import React` and `import * as React`. */
  namespaceNames: Set<string>;
};

function readReactBindings(sourceFile: ts.SourceFile): ReactBindings {
  const bindings: ReactBindings = {
    effectNames: new Set(),
    namespaceNames: new Set(),
  };
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react'
    ) {
      continue;
    }
    const clause = statement.importClause;
    if (clause?.name) {
      bindings.namespaceNames.add(clause.name.text);
    }
    const named = clause?.namedBindings;
    if (named && ts.isNamespaceImport(named)) {
      bindings.namespaceNames.add(named.name.text);
    } else if (named) {
      for (const element of named.elements) {
        if ((element.propertyName ?? element.name).text === 'useEffect') {
          bindings.effectNames.add(element.name.text);
        }
      }
    }
  }
  return bindings;
}

/**
 * `useEffect(` and `run(` for an aliased import are React effects. A member call
 * counts only on a react namespace binding, so `lifecycle.useEffect()` on an
 * unrelated object is not one.
 */
function isUseEffectCallee(
  expression: ts.Expression,
  react: ReactBindings,
): boolean {
  if (ts.isIdentifier(expression)) {
    return (
      expression.text === 'useEffect' || react.effectNames.has(expression.text)
    );
  }
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'useEffect' &&
    ts.isIdentifier(expression.expression) &&
    react.namespaceNames.has(expression.expression.text)
  );
}

function isAsyncWork(node: ts.Node): boolean {
  if (ts.isAwaitExpression(node)) {
    return true;
  }
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const callee = node.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text === 'fetch';
  }
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'then';
}

function inspectEffectCallback(callback: ts.Node): {
  hasAbort: boolean;
  hasAsyncWork: boolean;
} {
  let hasAbort = false;
  let hasAsyncWork = false;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && ABORT_IDENTIFIERS.has(node.text)) {
      hasAbort = true;
    }
    if (isAsyncWork(node)) {
      hasAsyncWork = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(callback);
  return { hasAbort, hasAsyncWork };
}

export function findEffectFindings(
  file: string,
  source: string,
): EffectFinding[] {
  const sourceFile = parseSourceFile(file, source, true, scriptKindFor(file));
  const react = readReactBindings(sourceFile);
  const lines = source.split('\n');
  const findings: EffectFinding[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      isUseEffectCallee(node.expression, react)
    ) {
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1;
      const previous = lines[line - 2] ?? '';
      if (!AUDIT_IGNORE_PATTERN.test(previous)) {
        findings.push({ file, kind: 'use_effect', line });
        const callback = node.arguments[0];
        if (callback) {
          const { hasAbort, hasAsyncWork } = inspectEffectCallback(callback);
          if (hasAsyncWork && !hasAbort) {
            findings.push({ file, kind: 'async_effect_without_abort', line });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return findings;
}

export function scanEffects(
  includeGlobs = INCLUDE_GLOBS,
  ignoreGlobs = IGNORE_GLOBS,
  root = ROOT,
): EffectFinding[] {
  const files = globSync(includeGlobs, {
    cwd: root,
    ignore: ignoreGlobs,
    nodir: true,
  }).sort((left, right) => left.localeCompare(right));

  return files.flatMap((file) =>
    findEffectFindings(file, readFileSync(path.join(root, file), 'utf8')),
  );
}

export function toCounts(findings: readonly EffectFinding[]): EffectCounts {
  const counts: EffectCounts = {
    async_effect_without_abort: {},
    use_effect: {},
  };
  for (const finding of findings) {
    const byFile = counts[finding.kind];
    byFile[finding.file] = (byFile[finding.file] ?? 0) + 1;
  }
  for (const kind of EFFECT_KINDS) {
    counts[kind] = Object.fromEntries(
      Object.entries(counts[kind]).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }
  return counts;
}

export function readBaselineShape(raw: unknown): EffectCounts {
  const parsed = (raw ?? {}) as Partial<EffectCounts>;
  return {
    async_effect_without_abort: parsed.async_effect_without_abort ?? {},
    use_effect: parsed.use_effect ?? {},
  };
}

export function evaluateEffects(
  baseline: EffectCounts,
  actual: EffectCounts,
): EffectViolation[] {
  const violations: EffectViolation[] = [];

  for (const kind of EFFECT_KINDS) {
    const files = [
      ...new Set([
        ...Object.keys(baseline[kind]),
        ...Object.keys(actual[kind]),
      ]),
    ].sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const baseCount = baseline[kind][file] ?? 0;
      const actualCount = actual[kind][file] ?? 0;
      if (actualCount === baseCount) {
        continue;
      }
      let type: EffectViolation['type'] = 'stale_baseline';
      if (actualCount > baseCount) {
        type = baseCount === 0 ? 'new_file' : 'growth';
      }
      violations.push({
        actual: actualCount,
        baseline: baseCount,
        file,
        kind,
        type,
      });
    }
  }

  return violations;
}

function total(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

const REMEDY: Record<EffectKind, string> = {
  async_effect_without_abort:
    'create an AbortController in the effect, pass its signal to the request and abort it in the cleanup',
  use_effect:
    'derive the value during render, run the work in the event handler that caused it, read external stores with useSyncExternalStore, or use a data hook; if it only subscribes to a system outside React, add `// use-effect-audit: ignore <reason>` on the line above',
};

export function formatEffectSummary(
  actual: EffectCounts,
  violations: readonly EffectViolation[],
): string {
  let output = 'useEffect ratchet (production sources)\n';
  output += `  useEffect calls:                ${total(actual.use_effect)} across ${Object.keys(actual.use_effect).length} files\n`;
  output += `  async effects without an abort: ${total(actual.async_effect_without_abort)} across ${Object.keys(actual.async_effect_without_abort).length} files\n`;

  if (violations.length === 0) {
    return `${output}  OK — every count is at its baseline.\n`;
  }

  output += '\nViolations:\n';
  for (const violation of violations) {
    if (violation.type === 'stale_baseline') {
      output += `  [STALE ${violation.kind}] ${violation.file}: baseline ${violation.baseline} but ${violation.actual} remain — prune with: bun run check:use-effect --update-baseline\n`;
    } else {
      const label = violation.type === 'new_file' ? 'NEW' : 'GROW';
      output += `  [${label} ${violation.kind}] ${violation.file}: ${violation.actual} > baseline ${violation.baseline}. To fix: ${REMEDY[violation.kind]}.\n`;
    }
  }
  output +=
    '\nDo not add to the baseline to get past this; it only shrinks (check:ratchet-growth).\n';
  return output;
}

/** One key per counted finding, so a PR that raises a count is growth. */
export function useEffectBaselineEntryKeys(content: string): string[] {
  const baseline = readBaselineShape(JSON.parse(content) as unknown);
  return EFFECT_KINDS.flatMap((kind) =>
    Object.entries(baseline[kind]).flatMap(([file, count]) =>
      Array.from({ length: count }, () => `${kind}|${file}`),
    ),
  );
}

function main(): void {
  const actual = toCounts(scanEffects());
  const baseline = readBaselineShape(
    JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as unknown,
  );
  const violations = evaluateEffects(baseline, actual);

  if (process.argv.includes('--update-baseline')) {
    const grew = violations.filter(
      (violation) => violation.type !== 'stale_baseline',
    );
    if (grew.length > 0) {
      process.stdout.write(formatEffectSummary(actual, grew));
      process.exit(1);
    }
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(actual, null, 2)}\n`,
      'utf8',
    );
    process.stdout.write(
      `Updated useEffect baseline (${total(actual.use_effect)} effects, ${total(actual.async_effect_without_abort)} async without abort).\n`,
    );
    return;
  }

  process.stdout.write(formatEffectSummary(actual, violations));
  if (violations.length > 0) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
