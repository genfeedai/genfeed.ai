import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { ToolsetName } from '../src/registry/toolset-names';

const CATALOG_PATH = 'packages/actions/src/registry/curated-action-catalog.ts';

/**
 * Matches one catalog entry after its source lines have been collapsed to a
 * single whitespace-normalized string (see `readEntry`). This lets the same
 * pattern accept every shape Biome produces for an entry — a short one-liner,
 * a reflowed multi-line object once a longer field (like `toolset`) pushes it
 * past the print width, and the always-multi-line publishing-approval shape —
 * without caring where the line breaks or trailing commas land.
 */
const ENTRY_PATTERN =
  /^\{ (?:isPublishingApprovalRequired: true, )?name: '([a-z][a-z0-9_]*)', surfaces: \[((?:'(?:agent|mcp)'(?:, )?)*)\](?:, toolset: '([a-z][a-z0-9-]*)')?,? \},?$/u;

export type CatalogSurface = 'agent' | 'mcp';

export interface ParsedCatalogAction {
  line: number;
  name: string;
  surfaces: CatalogSurface[];
  toolset: ToolsetName | undefined;
}

export type CatalogChangeKind =
  | 'action-added'
  | 'action-removed'
  | 'surface-added'
  | 'surface-removed'
  | 'toolset-changed';

export interface CatalogChange {
  action: string;
  kind: CatalogChangeKind;
  line: number;
  previousToolset?: ToolsetName;
  surfaces: CatalogSurface[];
  toolset?: ToolsetName;
}

/**
 * Reads one catalog entry starting at `lines[startIndex]` (which must be the
 * line holding the entry's opening `{`), walking forward brace-balanced so a
 * multi-line object is collected in full. Returns the raw source lines that
 * make up the entry and the index of the line after it.
 */
function readEntry(
  lines: readonly string[],
  startIndex: number,
  end: number,
): { nextIndex: number; raw: string[] } {
  let depth = 0;
  const raw: string[] = [];
  let index = startIndex;
  for (; index < end; index += 1) {
    const current = lines[index] ?? '';
    raw.push(current);
    for (const character of current) {
      if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
      }
    }
    if (depth === 0) {
      break;
    }
  }
  return { nextIndex: index + 1, raw };
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
  let index = start + 1;
  while (index < end) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      index += 1;
      continue;
    }

    const entryLine = index + 1;
    if (!trimmed.startsWith('{')) {
      throw new Error(
        `${fileName}:${entryLine} is not a canonical catalog entry`,
      );
    }

    const { nextIndex, raw } = readEntry(lines, index, end);
    index = nextIndex;

    const normalized = raw.join(' ').replace(/\s+/gu, ' ').trim();
    const match = normalized.match(ENTRY_PATTERN);
    if (!match) {
      throw new Error(
        `${fileName}:${entryLine} is not a canonical catalog entry`,
      );
    }

    const [, name, surfaceText, toolset] = match;
    if (!name || surfaceText === undefined) {
      throw new Error(`${fileName}:${entryLine} has an invalid catalog entry`);
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
    actions.push({
      line: entryLine,
      name,
      surfaces,
      toolset: toolset as ToolsetName | undefined,
    });
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
        toolset: current.toolset,
      });
      continue;
    }
    if (previous && !current) {
      changes.push({
        action: name,
        kind: 'action-removed',
        line: previous.line,
        surfaces: previous.surfaces,
        toolset: previous.toolset,
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
        toolset: current.toolset,
      });
    }
    if (added.length > 0) {
      changes.push({
        action: name,
        kind: 'surface-added',
        line: current.line,
        surfaces: added,
        toolset: current.toolset,
      });
    }
    if (previous.toolset !== current.toolset) {
      changes.push({
        action: name,
        kind: 'toolset-changed',
        line: current.line,
        previousToolset: previous.toolset,
        surfaces: current.surfaces,
        toolset: current.toolset,
      });
    }
  }

  return changes;
}

function formatToolsetValue(toolset: ToolsetName | undefined): string {
  return toolset ?? '(none)';
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
    case 'toolset-changed':
      return `Curated action toolset changed: ${change.action} (${formatToolsetValue(
        change.previousToolset,
      )} -> ${formatToolsetValue(change.toolset)})`;
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

  lines.push(
    '',
    '| Change | Action | Surface(s) | Toolset |',
    '| --- | --- | --- | --- |',
  );
  for (const change of changes) {
    const toolsetColumn =
      change.kind === 'toolset-changed'
        ? `${formatToolsetValue(change.previousToolset)} -> ${formatToolsetValue(
            change.toolset,
          )}`
        : formatToolsetValue(change.toolset);
    lines.push(
      `| ${change.kind} | \`${change.action}\` | ${change.surfaces.join(', ')} | ${toolsetColumn} |`,
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
