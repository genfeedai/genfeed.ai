import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCatalogSource } from '../../packages/actions/scripts/report-curated-action-catalog';
import {
  getRetiredMcpCatalogTool,
  isMcpListedToolName,
} from '../../packages/actions/src/registry/mcp-catalog-calls';

const HISTORICAL_MENTION_PATTERN = /\b(?:historical|retired|removed)\b/iu;
const TRAILING_CALL_VERB_PATTERN =
  /\b(?:call|calling|invoke|invoking|use|using)\b[^\x60]*$/iu;
const LEADING_CODE_SPAN_PATTERN = /^`[^`]+`/u;
const SERVER_MENTION_PATTERN = /^\s*(?:MCP\s+)?server\b/iu;
const FIELD_MENTION_PATTERN =
  /\b(?:fields?|parameters?|keys?|IDs?|formats?|labels?|values?)\s*[:=]?[^`]*$/iu;
const TRAILING_TOOL_VERB_PATTERN =
  /\b(?:call|calling|invoke|invoking|tools?)\b[^`]*$/iu;
const LEADING_TOOLS_MENTION_PATTERN =
  /^\s*(?:tools?\b|(?:and|or)\s+`[^`]+`\s+tools?\b)/iu;
const TRAILING_USE_VERB_PATTERN = /\b(?:use|using)\b[^`]*$/iu;
const CLOSING_FENCE_PATTERN = /^\s*(`+|~+)\s*$/u;
const OPENING_FENCE_PATTERN = /^\s*(`{3,}|~{3,})(.*)$/u;
const GENFEED_WORD_PATTERN = /genfeed/iu;
const GENFEED_MCP_SERVER_REFERENCE_PATTERN =
  /(?:mcp__genfeed__|["']?server["']?\s*:\s*["']genfeed["'])/iu;
const GENFEED_TOOL_HEADING_PATTERN =
  /^(?:#{1,6}\s+)?Genfeed\s+(?:tool\s+)?(?:call|tools?|invoke)\b/iu;
const TOOL_NAME_PROPERTIES_PATTERN =
  /(?<![a-z0-9_])(?:["']?(tool|tool_name|name)["']?\s*:\s*["'])([a-z][a-z0-9_]+)["']/gu;
const OPEN_BRACES_PATTERN = /\{/gu;
const CLOSE_BRACES_PATTERN = /\}/gu;
const GENFEED_MCP_PREFIX_PATTERN = /^mcp__genfeed__/u;
const TOOL_COLUMN_HEADER_PATTERN = /^(?:MCP\s+)?Tool(?:\s+name)?$/iu;
const EDGE_BACKTICKS_PATTERN = /^`|`$/gu;
const CODE_SPANS_PATTERN = /`([^`]+)`/gu;
const GENFEED_MCP_TOOL_NAMES_PATTERN = /\bmcp__genfeed__([a-z][a-z0-9_]*)\b/gu;
const IGNORED_MARKDOWN_PATH_PATTERN =
  /(?:^|\/)(?:\.git|node_modules|fixtures)(?:\/|$)/u;

const CATALOG = 'packages/actions/src/registry/curated-action-catalog.ts';
const TOKEN = /^[a-z][a-z0-9_]*$/u;
function isHistoricalRetiredMention(
  line: string,
  offset: number,
  name: string,
): boolean {
  return Boolean(
    getRetiredMcpCatalogTool(name) &&
      HISTORICAL_MENTION_PATTERN.test(line) &&
      !TRAILING_CALL_VERB_PATTERN.test(line.slice(0, offset)),
  );
}

function isToolInstruction(
  line: string,
  offset: number,
  name: string,
): boolean {
  const before = line.slice(0, offset);
  const after = line.slice(offset).replace(LEADING_CODE_SPAN_PATTERN, '');
  // Parameters, provenance labels, server names and IDs are data.
  if (SERVER_MENTION_PATTERN.test(after)) return false;
  if (FIELD_MENTION_PATTERN.test(before)) return false;
  return (
    TRAILING_TOOL_VERB_PATTERN.test(before) ||
    LEADING_TOOLS_MENTION_PATTERN.test(after) ||
    (name.includes('_') && TRAILING_USE_VERB_PATTERN.test(before))
  );
}

export interface ReferenceSource {
  path: string;
  text: string;
}
export interface McpReferenceViolation {
  path: string;
  line: number;
  name: string;
  surface: string;
}
export interface McpReferenceOptions {
  repoRoot?: string;
  catalogPath?: string;
  skillsDir?: string;
  noLocalSkills?: boolean;
  noDesktop?: boolean;
  sources?: ReferenceSource[];
}

export function checkReferenceSources(
  catalogPath: string,
  sources: ReferenceSource[],
): McpReferenceViolation[] {
  const catalog = parseCatalogSource(
    readFileSync(catalogPath, 'utf8'),
    catalogPath,
  );
  if (!catalog.length)
    throw new Error(`${catalogPath}: empty curated action catalog`);
  const actions = new Map(catalog.map((action) => [action.name, action]));
  const violations: McpReferenceViolation[] = [];
  for (const source of sources) {
    const lines = source.text.split('\n');
    let fenceMarker: string | undefined;
    const closesFence = (line: string): boolean => {
      const marker = CLOSING_FENCE_PATTERN.exec(line)?.[1];
      return Boolean(
        marker &&
          fenceMarker &&
          marker[0] === fenceMarker[0] &&
          marker.length >= fenceMarker.length,
      );
    };
    let toolColumn = -1;
    let genfeedExample = false;
    const fencedFields = new Map<number, string[]>();
    for (const [index, line] of lines.entries()) {
      const opener = OPENING_FENCE_PATTERN.exec(line);
      if (fenceMarker && closesFence(line)) {
        fenceMarker = undefined;
        genfeedExample = false;
        continue;
      }
      if (!fenceMarker && opener) {
        fenceMarker = opener[1];
        genfeedExample = GENFEED_WORD_PATTERN.test(opener[2] ?? '');
        if (!genfeedExample) {
          const closing = lines.findIndex(
            (next, nextIndex) => nextIndex > index && closesFence(next),
          );
          const example = lines
            .slice(index + 1, closing < 0 ? undefined : closing)
            .join('\n');
          genfeedExample =
            GENFEED_MCP_SERVER_REFERENCE_PATTERN.test(example) ||
            GENFEED_TOOL_HEADING_PATTERN.test(
              lines
                .slice(0, index)
                .findLast((previous) => previous.trim())
                ?.trim() ?? '',
            );
        }
        if (genfeedExample) {
          const end = lines.findIndex(
            (next, nextIndex) => nextIndex > index && closesFence(next),
          );
          const block = lines
            .slice(index + 1, end < 0 ? undefined : end)
            .join('\n');
          for (const field of block.matchAll(TOOL_NAME_PROPERTIES_PATTERN)) {
            const prefix = block.slice(0, field.index);
            const depth =
              (prefix.match(OPEN_BRACES_PATTERN)?.length ?? 0) -
              (prefix.match(CLOSE_BRACES_PATTERN)?.length ?? 0);
            if (field[1] === 'name' && depth > 1) continue;
            const fieldLine = index + 1 + prefix.split('\n').length - 1;
            fencedFields.set(fieldLine, [
              ...(fencedFields.get(fieldLine) ?? []),
              (field[2] ?? '').replace(GENFEED_MCP_PREFIX_PATTERN, ''),
            ]);
          }
        }
        continue;
      }
      const candidates = new Set<string>();
      if (!fenceMarker && line.trim().startsWith('|')) {
        const cells = line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim());
        const header = cells.findIndex((cell) =>
          TOOL_COLUMN_HEADER_PATTERN.test(cell),
        );
        if (header >= 0) toolColumn = header;
        else if (toolColumn >= 0) {
          const token = (cells[toolColumn] ?? '').replace(
            EDGE_BACKTICKS_PATTERN,
            '',
          );
          const name = token.replace(GENFEED_MCP_PREFIX_PATTERN, '');
          if (TOKEN.test(name)) candidates.add(name);
        }
      } else if (!fenceMarker) toolColumn = -1;
      if (!fenceMarker) {
        for (const match of line.matchAll(CODE_SPANS_PATTERN)) {
          const token = match[1] ?? '';
          const name = token.replace(GENFEED_MCP_PREFIX_PATTERN, '');
          if (
            TOKEN.test(name) &&
            !isHistoricalRetiredMention(line, match.index ?? 0, name) &&
            (token.startsWith('mcp__genfeed__') ||
              (actions.has(name) && isMcpListedToolName(name)) ||
              isToolInstruction(line, match.index ?? 0, name))
          )
            candidates.add(name);
        }
      }
      for (const match of line.matchAll(GENFEED_MCP_TOOL_NAMES_PATTERN))
        if (!isHistoricalRetiredMention(line, match.index ?? 0, match[1] ?? ''))
          candidates.add(match[1] ?? '');
      for (const field of fencedFields.get(index) ?? []) candidates.add(field);
      for (const name of candidates) {
        const action = actions.get(name);
        if (!action?.surfaces.includes('mcp') || !isMcpListedToolName(name))
          violations.push({
            path: source.path,
            line: index + 1,
            name,
            surface: getRetiredMcpCatalogTool(name)
              ? 'retired from MCP'
              : (action?.surfaces.join(', ') ?? 'missing'),
          });
      }
    }
  }
  return violations;
}

function trackedMarkdown(root: string, prefix?: string): ReferenceSource[] {
  if (!existsSync(root))
    throw new Error(`Requested source directory is missing: ${root}`);
  if (
    realpathSync(
      execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
      }).trim(),
    ) !== realpathSync(root)
  )
    throw new Error(
      `Malformed source checkout: ${root} must be the repository root`,
    );
  const sources = execFileSync(
    'git',
    ['-C', root, 'ls-files', '-z', ...(prefix ? ['--', prefix] : [])],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(
      (file) =>
        file.endsWith('.md') && !IGNORED_MARKDOWN_PATH_PATTERN.test(file),
    )
    .map((file) => ({
      path: join(root, file),
      text: readFileSync(join(root, file), 'utf8'),
    }));
  if (!sources.length || sources.every((source) => !source.text.trim()))
    throw new Error(`Empty instruction source: ${root}`);
  return sources;
}

export function runCheckMcpToolReferences(
  options: McpReferenceOptions = {},
): McpReferenceViolation[] {
  const root = resolve(
    options.repoRoot ?? resolve(import.meta.dirname, '../..'),
  );
  const catalog = resolve(root, options.catalogPath ?? CATALOG);
  if (options.sources) return checkReferenceSources(catalog, options.sources);
  if (options.noLocalSkills && options.noDesktop && !options.skillsDir)
    throw new Error('No instruction surface selected');
  const sources: ReferenceSource[] = [];
  if (!options.noLocalSkills) {
    if (!existsSync(join(root, 'skills')))
      throw new Error(
        `Requested source directory is missing: ${join(root, 'skills')}`,
      );
    sources.push(...trackedMarkdown(root, 'skills'));
  }
  if (options.skillsDir)
    sources.push(...trackedMarkdown(resolve(options.skillsDir)));
  if (!options.noDesktop) {
    const adapter = join(
      root,
      'scripts/architecture/desktop-mcp-prompt-adapter.ts',
    );
    const output = execFileSync(
      'bun',
      [
        '--tsconfig-override',
        join(root, 'apps/desktop/tsconfig.json'),
        adapter,
      ],
      { encoding: 'utf8', cwd: root },
    );
    let promptSources: unknown;
    try {
      promptSources = JSON.parse(output);
    } catch {
      throw new Error(`${adapter}: malformed JSON output`);
    }
    if (
      !Array.isArray(promptSources) ||
      !promptSources.every(
        (source: unknown): source is ReferenceSource =>
          typeof source === 'object' &&
          source !== null &&
          'path' in source &&
          typeof source.path === 'string' &&
          'text' in source &&
          typeof source.text === 'string',
      )
    ) {
      throw new Error(
        `${adapter}: expected an array of objects with string path and text`,
      );
    }
    sources.push(...promptSources);
  }
  return checkReferenceSources(catalog, sources);
}

export function assertMcpReferences(
  catalogPath: string,
  sources: ReferenceSource[],
): void {
  const violations = checkReferenceSources(catalogPath, sources);
  if (violations.length)
    throw new Error(
      violations
        .map(
          (item) =>
            `${item.path}:${item.line}: ${item.name} has unsupported surface (${item.surface}); MCP required`,
        )
        .join('\n'),
    );
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    if (!args.includes(flag)) return undefined;
    const result = args[args.indexOf(flag) + 1];
    if (!result || result.startsWith('--'))
      throw new Error(`${flag} requires a path`);
    return result;
  };
  const violations = runCheckMcpToolReferences({
    repoRoot: value('--repo-root'),
    catalogPath: value('--catalog-path'),
    skillsDir: value('--skills-dir'),
    noLocalSkills: args.includes('--no-local-skills'),
    noDesktop: args.includes('--no-desktop'),
  });
  for (const item of violations)
    console.error(
      `${item.path}:${item.line}: ${item.name} has unsupported surface (${item.surface}); MCP required`,
    );
  if (violations.length) process.exit(1);
  console.log('MCP tool references verified.');
}
