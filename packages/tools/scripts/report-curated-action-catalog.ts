import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CATALOG_PATH = 'packages/tools/src/registry/curated-action-catalog.ts';
const ENTRY_PATTERN =
  /^\s*\{ name: '([a-z][a-z0-9_]*)', surfaces: \[((?:'(?:agent|mcp)'(?:, )?)*)\] \},\s*$/u;

export type CatalogSurface = 'agent' | 'mcp';

export interface ParsedCatalogAction {
  line: number;
  name: string;
  surfaces: CatalogSurface[];
}

export type CatalogChangeKind =
  | 'action-added'
  | 'action-removed'
  | 'surface-added'
  | 'surface-removed';

export interface CatalogChange {
  action: string;
  kind: CatalogChangeKind;
  line: number;
  surfaces: CatalogSurface[];
}

export function parseCatalogSource(
  sourceText: string,
  fileName = CATALOG_PATH,
): ParsedCatalogAction[] {
  if (sourceText.trim().length === 0) {
    return [];
  }

  const lines = sourceText.split('\n');
  const start = lines.findIndex((line) =>
    line.includes('export const CURATED_ACTION_CATALOG = ['),
  );
  const end = lines.findIndex(
    (line, index) => index > start && line.trimStart().startsWith('] as const'),
  );
  if (start < 0 || end < 0) {
    throw new Error(
      `${fileName} does not declare CURATED_ACTION_CATALOG in canonical array form`,
    );
  }

  const actions: ParsedCatalogAction[] = [];
  const names = new Set<string>();
  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim().length === 0 || line.trimStart().startsWith('//')) {
      continue;
    }
    const match = line.match(ENTRY_PATTERN);
    if (!match) {
      throw new Error(
        `${fileName}:${index + 1} is not a canonical catalog entry`,
      );
    }
    const [, name, surfaceText] = match;
    if (!name || surfaceText === undefined) {
      throw new Error(`${fileName}:${index + 1} has an invalid catalog entry`);
    }
    const surfaces = [...surfaceText.matchAll(/'(agent|mcp)'/gu)].map(
      (surface) => surface[1] as CatalogSurface,
    );
    if (surfaces.length === 0 || new Set(surfaces).size !== surfaces.length) {
      throw new Error(
        `${fileName} entry ${name} must have unique, non-empty surfaces`,
      );
    }
    if (names.has(name)) {
      throw new Error(`${fileName} duplicates action ${name}`);
    }
    names.add(name);
    actions.push({ line: index + 1, name, surfaces });
  }

  return actions.sort((a, b) => a.name.localeCompare(b.name));
}

function surfaceDifference(
  left: readonly CatalogSurface[],
  right: readonly CatalogSurface[],
): CatalogSurface[] {
  const rightSet = new Set(right);
  return left.filter((surface) => !rightSet.has(surface));
}

export function diffCatalogs(
  before: readonly ParsedCatalogAction[],
  after: readonly ParsedCatalogAction[],
): CatalogChange[] {
  const beforeByName = new Map(before.map((action) => [action.name, action]));
  const afterByName = new Map(after.map((action) => [action.name, action]));
  const names = [
    ...new Set([...beforeByName.keys(), ...afterByName.keys()]),
  ].sort((a, b) => a.localeCompare(b));
  const changes: CatalogChange[] = [];

  for (const name of names) {
    const previous = beforeByName.get(name);
    const current = afterByName.get(name);
    if (!previous && current) {
      changes.push({
        action: name,
        kind: 'action-added',
        line: current.line,
        surfaces: current.surfaces,
      });
      continue;
    }
    if (previous && !current) {
      changes.push({
        action: name,
        kind: 'action-removed',
        line: previous.line,
        surfaces: previous.surfaces,
      });
      continue;
    }
    if (!previous || !current) {
      continue;
    }

    const removed = surfaceDifference(previous.surfaces, current.surfaces);
    const added = surfaceDifference(current.surfaces, previous.surfaces);
    if (removed.length > 0) {
      changes.push({
        action: name,
        kind: 'surface-removed',
        line: current.line,
        surfaces: removed,
      });
    }
    if (added.length > 0) {
      changes.push({
        action: name,
        kind: 'surface-added',
        line: current.line,
        surfaces: added,
      });
    }
  }

  return changes;
}

function describeChange(change: CatalogChange): string {
  const surfaces = change.surfaces.join(', ');
  switch (change.kind) {
    case 'action-added':
      return `Curated action added: ${change.action} (${surfaces})`;
    case 'action-removed':
      return `Curated action removed: ${change.action} (${surfaces})`;
    case 'surface-added':
      return `Curated action surface added: ${change.action} (${surfaces})`;
    case 'surface-removed':
      return `Curated action surface removed: ${change.action} (${surfaces})`;
  }
}

function escapeWorkflowCommand(value: string): string {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

export function formatWarningAnnotation(change: CatalogChange): string {
  return `::warning file=${CATALOG_PATH},line=${change.line}::${escapeWorkflowCommand(
    describeChange(change),
  )}`;
}

export function formatStepSummary(changes: readonly CatalogChange[]): string {
  const lines = [
    '## Curated action catalog changes',
    '',
    changes.length === 0
      ? 'No action additions, removals, or surface transitions detected.'
      : `${changes.length} reviewed catalog change(s) detected.`,
  ];
  if (changes.length === 0) {
    return `${lines.join('\n')}\n`;
  }

  lines.push('', '| Change | Action | Surface(s) |', '| --- | --- | --- |');
  for (const change of changes) {
    lines.push(
      `| ${change.kind} | \`${change.action}\` | ${change.surfaces.join(', ')} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function main(): void {
  const beforePath = readArgument('before');
  const afterPath = readArgument('after');
  const summaryPath = readArgument('summary');
  if (!beforePath || !afterPath) {
    throw new Error(
      'Usage: catalog:changes --before=<base-catalog.ts> --after=<head-catalog.ts> [--summary=<path>]',
    );
  }

  const before = parseCatalogSource(
    readFileSync(beforePath, 'utf8'),
    beforePath,
  );
  const after = parseCatalogSource(readFileSync(afterPath, 'utf8'), afterPath);
  const changes = diffCatalogs(before, after);

  for (const change of changes) {
    console.log(formatWarningAnnotation(change));
  }
  const summary = formatStepSummary(changes);
  console.log(summary.trimEnd());
  if (summaryPath) {
    writeFileSync(summaryPath, summary, { flag: 'a' });
  }
}

const entryPoint = process.argv[1];
if (entryPoint && path.resolve(entryPoint) === path.resolve(__filename)) {
  main();
}
