import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCatalogSource } from '../../packages/actions/scripts/report-curated-action-catalog';

const CATALOG = 'packages/actions/src/registry/curated-action-catalog.ts';
const TOKEN = /^[a-z][a-z0-9_]*$/u;
function isToolInstruction(
  line: string,
  offset: number,
  name: string,
): boolean {
  const before = line.slice(0, offset);
  const after = line.slice(offset).replace(/^`[^`]+`/u, '');
  // Parameters, provenance labels, server names and IDs are data.
  if (/^\s*(?:MCP\s+)?server\b/iu.test(after)) return false;
  if (
    /\b(?:fields?|parameters?|keys?|IDs?|formats?|labels?|values?)\s*[:=]?[^`]*$/iu.test(
      before,
    )
  )
    return false;
  return (
    /\b(?:call|calling|invoke|invoking|tools?)\b[^`]*$/iu.test(before) ||
    /^\s*(?:tools?\b|(?:and|or)\s+`[^`]+`\s+tools?\b)/iu.test(after) ||
    (name.includes('_') && /\b(?:use|using)\b[^`]*$/iu.test(before))
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
    let fenced = false;
    let toolColumn = -1;
    let genfeedExample = false;
    const fencedFields = new Map<number, string[]>();
    for (const [index, line] of lines.entries()) {
      if (/^\s*```/u.test(line)) {
        fenced = !fenced;
        genfeedExample = fenced && /genfeed/iu.test(line);
        if (fenced && !genfeedExample) {
          const closing = lines.findIndex(
            (next, nextIndex) => nextIndex > index && /^\s*```/u.test(next),
          );
          const example = lines
            .slice(index + 1, closing < 0 ? undefined : closing)
            .join('\n');
          genfeedExample =
            /(?:mcp__genfeed__|["']?server["']?\s*:\s*["']genfeed["']|\bgenfeed\b)/iu.test(
              example,
            ) ||
            /\bgenfeed\b/iu.test(
              lines.slice(Math.max(0, index - 2), index).join(' '),
            );
        }
        if (fenced && genfeedExample) {
          const end = lines.findIndex(
            (next, nextIndex) => nextIndex > index && /^\s*```/u.test(next),
          );
          const block = lines
            .slice(index + 1, end < 0 ? undefined : end)
            .join('\n');
          for (const field of block.matchAll(
            /(?:["']?(tool|tool_name|name)["']?\s*:\s*["'])([a-z][a-z0-9_]+)["']/gu,
          )) {
            const prefix = block.slice(0, field.index);
            const depth =
              (prefix.match(/\{/gu)?.length ?? 0) -
              (prefix.match(/\}/gu)?.length ?? 0);
            if (field[1] === 'name' && depth > 1) continue;
            const fieldLine = index + 1 + prefix.split('\n').length - 1;
            fencedFields.set(fieldLine, [
              ...(fencedFields.get(fieldLine) ?? []),
              (field[2] ?? '').replace(/^mcp__genfeed__/u, ''),
            ]);
          }
        }
        continue;
      }
      const candidates = new Set<string>();
      if (!fenced && line.trim().startsWith('|')) {
        const cells = line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim());
        const header = cells.findIndex((cell) =>
          /^(?:MCP\s+)?Tool(?:\s+name)?$/iu.test(cell),
        );
        if (header >= 0) toolColumn = header;
        else if (toolColumn >= 0) {
          const token = (cells[toolColumn] ?? '').replace(/^`|`$/gu, '');
          const name = token.replace(/^mcp__genfeed__/u, '');
          if (TOKEN.test(name)) candidates.add(name);
        }
      } else if (!fenced) toolColumn = -1;
      if (!fenced) {
        for (const match of line.matchAll(/`([^`]+)`/gu)) {
          const token = match[1] ?? '';
          const name = token.replace(/^mcp__genfeed__/u, '');
          if (
            TOKEN.test(name) &&
            (token.startsWith('mcp__genfeed__') ||
              actions.has(name) ||
              isToolInstruction(line, match.index ?? 0, name))
          )
            candidates.add(name);
        }
      }
      for (const match of line.matchAll(
        /\bmcp__genfeed__([a-z][a-z0-9_]*)\b/gu,
      ))
        candidates.add(match[1] ?? '');
      for (const field of fencedFields.get(index) ?? []) candidates.add(field);
      for (const name of candidates) {
        const action = actions.get(name);
        if (!action?.surfaces.includes('mcp'))
          violations.push({
            path: source.path,
            line: index + 1,
            name,
            surface: action?.surfaces.join(', ') ?? 'missing',
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
        file.endsWith('.md') &&
        !/(?:^|\/)(?:\.git|node_modules|fixtures)(?:\/|$)/u.test(file),
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
    const promptSources: ReferenceSource[] = JSON.parse(
      execFileSync(
        'bun',
        [
          '--tsconfig-override',
          join(root, 'apps/desktop/app/tsconfig.json'),
          join(root, 'scripts/architecture/desktop-mcp-prompt-adapter.ts'),
        ],
        { encoding: 'utf8', cwd: root },
      ),
    );
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
