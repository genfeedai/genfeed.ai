import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  parseSourceFile,
  scriptKindFor,
} from '../../architecture/parse-source-file';

/**
 * Drift guard for hand-built UI. Each area (badge, alert, card, ...) is one
 * file in `areas/` that exports an `HandBuiltArea`, and one
 * `<area>.baseline.json` next to it, so parallel PRs never edit the same
 * baseline. Findings may only go down: a count above the baseline fails, and
 * a count below it fails until the baseline is ratcheted in the same PR
 * (`bun run check:ui-hand-built -- --update-baseline <area>`).
 *
 * The only escape hatch is `ui-guard-allow:<rule> -- <reason>` on the line
 * above (or on) the flagged element. `design-system-allow-content-color` does
 * not silence these rules.
 */

export const HAND_BUILT_BASELINE_VERSION = 1;

export interface HandBuiltFinding {
  detail: string;
  file: string;
  line: number;
  rule: string;
}

export interface HandBuiltBaseline {
  files: Record<string, Record<string, number>>;
  version: typeof HAND_BUILT_BASELINE_VERSION;
}

export interface HandBuiltSource {
  file: string;
  sourceFile: ts.SourceFile;
  text: string;
}

export interface HandBuiltArea {
  /** One baseline per area: `areas/<id>.baseline.json`. */
  id: string;
  /** Returns the findings for one scanned file. */
  scan: (source: HandBuiltSource) => HandBuiltFinding[];
}

export const SCANNED_ROOTS = ['apps', 'packages'] as const;

const SCANNED_EXTENSION = /\.(tsx|jsx)$/;
const IGNORED_PATH =
  /(^|\/)(node_modules|dist|build|\.next|coverage|tests?|__tests__|__mocks__)\/|\.(test|spec|stories)\.[jt]sx?$|\.d\.ts$/;

export function isScannedFile(file: string): boolean {
  return SCANNED_EXTENSION.test(file) && !IGNORED_PATH.test(file);
}

export function listScannedFiles(rootDir: string): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '--', ...SCANNED_ROOTS.map((root) => `${root}/`)],
    { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return output
    .split('\n')
    .filter((file) => file.length > 0 && isScannedFile(file))
    .filter((file) => existsSync(path.join(rootDir, file)));
}

export function readSource(rootDir: string, file: string): HandBuiltSource {
  const text = readFileSync(path.join(rootDir, file), 'utf8');
  return {
    file,
    sourceFile: parseSourceFile(file, text, scriptKindFor(file)),
    text,
  };
}

export function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

/** True when `ui-guard-allow:<rule> -- reason` is on the node's line or above. */
export function isAllowed(
  source: HandBuiltSource,
  node: ts.Node,
  rule: string,
): boolean {
  const lines = source.text.split('\n');
  const line = lineOf(source.sourceFile, node);
  const marker = new RegExp(`ui-guard-allow:${rule}\\s+--\\s+\\S`);
  return [lines[line - 1], lines[line - 2]].some(
    (candidate) => candidate !== undefined && marker.test(candidate),
  );
}

export function emptyBaseline(): HandBuiltBaseline {
  return { files: {}, version: HAND_BUILT_BASELINE_VERSION };
}

export function buildBaseline(findings: HandBuiltFinding[]): HandBuiltBaseline {
  const baseline = emptyBaseline();
  for (const finding of findings) {
    const rules = baseline.files[finding.file] ?? {};
    rules[finding.rule] = (rules[finding.rule] ?? 0) + 1;
    baseline.files[finding.file] = rules;
  }
  const sorted: HandBuiltBaseline['files'] = {};
  for (const file of Object.keys(baseline.files).sort()) {
    const rules = baseline.files[file] ?? {};
    sorted[file] = Object.fromEntries(
      Object.entries(rules).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return { files: sorted, version: HAND_BUILT_BASELINE_VERSION };
}

export function totalFindings(baseline: HandBuiltBaseline): number {
  return Object.values(baseline.files).reduce(
    (sum, rules) =>
      sum + Object.values(rules).reduce((count, value) => count + value, 0),
    0,
  );
}

export interface BaselineDiffEntry {
  actual: number;
  baseline: number;
  file: string;
  rule: string;
}

export function diffBaseline(
  baseline: HandBuiltBaseline,
  actual: HandBuiltBaseline,
): { regressions: BaselineDiffEntry[]; stale: BaselineDiffEntry[] } {
  const regressions: BaselineDiffEntry[] = [];
  const stale: BaselineDiffEntry[] = [];
  const files = new Set([
    ...Object.keys(baseline.files),
    ...Object.keys(actual.files),
  ]);
  for (const file of [...files].sort()) {
    const rules = new Set([
      ...Object.keys(baseline.files[file] ?? {}),
      ...Object.keys(actual.files[file] ?? {}),
    ]);
    for (const rule of [...rules].sort()) {
      const baselineCount = baseline.files[file]?.[rule] ?? 0;
      const actualCount = actual.files[file]?.[rule] ?? 0;
      const entry = {
        actual: actualCount,
        baseline: baselineCount,
        file,
        rule,
      };
      if (actualCount > baselineCount) {
        regressions.push(entry);
      } else if (actualCount < baselineCount) {
        stale.push(entry);
      }
    }
  }
  return { regressions, stale };
}

export function parseBaseline(raw: string, label: string): HandBuiltBaseline {
  const parsed = JSON.parse(raw) as Partial<HandBuiltBaseline>;
  if (
    parsed.version !== HAND_BUILT_BASELINE_VERSION ||
    typeof parsed.files !== 'object' ||
    parsed.files === null
  ) {
    throw new Error(
      `Invalid ${label}. Expected version ${HAND_BUILT_BASELINE_VERSION}.`,
    );
  }
  return parsed as HandBuiltBaseline;
}

export function serializeBaseline(baseline: HandBuiltBaseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

export function baselinePathFor(areasDir: string, areaId: string): string {
  return path.join(areasDir, `${areaId}.baseline.json`);
}

export function readBaseline(
  areasDir: string,
  areaId: string,
): HandBuiltBaseline {
  const file = baselinePathFor(areasDir, areaId);
  if (!existsSync(file)) {
    return emptyBaseline();
  }
  return parseBaseline(readFileSync(file, 'utf8'), `${areaId} baseline`);
}

export function writeBaseline(
  areasDir: string,
  areaId: string,
  baseline: HandBuiltBaseline,
): void {
  writeFileSync(
    baselinePathFor(areasDir, areaId),
    serializeBaseline(baseline),
    'utf8',
  );
}

/** Components this file imports by name from one of the given module paths. */
export function importedLocalNames(
  sourceFile: ts.SourceFile,
  modulePaths: readonly string[],
  exportedName: string,
): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !modulePaths.includes(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    if (exportedName === 'default' && statement.importClause?.name) {
      names.add(statement.importClause.name.text);
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === exportedName) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}
