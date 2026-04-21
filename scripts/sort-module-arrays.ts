/**
 * Sort Module Arrays
 *
 * Sorts decorator array properties (exports, imports, providers, controllers)
 * alphabetically in NestJS module files, preserving comment/blank-line groups.
 *
 * Usage: bun scripts/sort-module-arrays.ts [--dry-run] [--verbose]
 */
import { Logger } from '@nestjs/common';
import { Glob } from 'bun';

const logger = new Logger('SortModuleArrays');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const ARRAY_PROPS = ['controllers', 'exports', 'imports', 'providers'];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Count net open brackets in a string */
function bracketDepth(text: string): number {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
    }
  }
  return depth;
}

/** Check if a line ends with a comma (ignoring inline comments) */
function lineEndsWithComma(line: string): boolean {
  const stripped = line.replace(/\/\/.*$/, '').trimEnd();
  return stripped.endsWith(',');
}

/** Extract the code expression from entry text (strip comments and trailing comma) */
function extractCode(entryText: string): string {
  return entryText
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && l.trim() !== '')
    .join('\n')
    .replace(/,\s*$/, '')
    .replace(/\/\/.*$/, '')
    .trim();
}

/** Extract alphabetical sort key from a code expression */
function getSortKey(code: string): string | null {
  // forwardRef(() => X) → sort by X
  const fwdMatch = code.match(/^forwardRef\(\s*\(\)\s*=>\s*(\w+)\s*\)$/);
  if (fwdMatch) {
    return fwdMatch[1];
  }

  // Simple identifier (e.g. SomeService, SomeModule)
  if (/^\w+$/.test(code)) {
    return code;
  }

  // Complex expression (e.g. dynamic factory calls) → keep in place
  return null;
}

// ── Tokenization ─────────────────────────────────────────────────────────────

interface Token {
  type: 'entry' | 'gap';
  lines: string[];
  sortKey: string | null;
  originalIndex: number;
}

/**
 * Tokenize the array body into a stream of entries and gaps (blank lines).
 *
 * Rules:
 * - A blank line at depth 0, when not mid-entry, becomes a 'gap' token
 * - Comment lines at depth 0, when not mid-entry, start a new entry
 *   (they're attached to the next code entry as a group header)
 * - An entry completes when depth returns to 0 and the line ends with a comma
 */
function tokenize(body: string): Token[] {
  const tokens: Token[] = [];
  const lines = body.split('\n');
  let currentLines: string[] = [];
  let depth = 0;
  let entryIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Blank line while not accumulating an entry → gap separator
    if (currentLines.length === 0 && trimmed === '' && depth === 0) {
      tokens.push({
        lines: [line],
        originalIndex: -1,
        sortKey: null,
        type: 'gap',
      });
      continue;
    }

    // Accumulate into current entry
    currentLines.push(line);
    depth += bracketDepth(line);

    // Entry completes at depth 0 with trailing comma
    if (depth === 0 && lineEndsWithComma(line)) {
      const code = extractCode(currentLines.join('\n'));
      tokens.push({
        lines: [...currentLines],
        originalIndex: entryIndex++,
        sortKey: getSortKey(code),
        type: 'entry',
      });
      currentLines = [];
    }
  }

  // Leftover lines (trailing whitespace/indentation before ])
  if (currentLines.length > 0) {
    const hasContent = currentLines.some((l) => l.trim() !== '');
    if (hasContent) {
      const code = extractCode(currentLines.join('\n'));
      tokens.push({
        lines: [...currentLines],
        originalIndex: entryIndex++,
        sortKey: getSortKey(code),
        type: 'entry',
      });
    } else {
      // Just trailing whitespace — keep as a gap
      tokens.push({
        lines: [...currentLines],
        originalIndex: -1,
        sortKey: null,
        type: 'gap',
      });
    }
    currentLines = [];
  }

  return tokens;
}

// ── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sort entries within each group (between gap tokens).
 * Sortable entries are sorted alphabetically by sort key.
 * Unsortable entries (complex expressions) keep their original position at end of group.
 */
function sortTokens(tokens: Token[]): Token[] {
  const result: Token[] = [];
  let group: Token[] = [];

  function flushGroup(): void {
    if (group.length === 0) {
      return;
    }

    const sortable = group.filter((t) => t.sortKey !== null);
    const unsortable = group.filter((t) => t.sortKey === null);

    // Code-point comparison (case-sensitive, uppercase before lowercase)
    sortable.sort((a, b) => {
      const left = a.sortKey ?? '';
      const right = b.sortKey ?? '';
      return left < right ? -1 : left > right ? 1 : 0;
    });
    // Stable order for unsortable entries
    unsortable.sort((a, b) => a.originalIndex - b.originalIndex);

    result.push(...sortable, ...unsortable);
    group = [];
  }

  for (const token of tokens) {
    if (token.type === 'gap') {
      flushGroup();
      result.push(token);
    } else {
      group.push(token);
    }
  }

  flushGroup();
  return result;
}

/** Rebuild the array body from sorted tokens */
function rebuild(tokens: Token[]): string {
  return tokens.map((t) => t.lines.join('\n')).join('\n');
}

// ── Main processing ──────────────────────────────────────────────────────────

/**
 * Find and sort a specific decorator array property in file content.
 * Returns the modified content, or null if no change was needed.
 */
function sortDecoratorArray(content: string, prop: string): string | null {
  const propPattern = new RegExp(`(\\b${prop}:\\s*)\\[`);
  const match = propPattern.exec(content);
  if (!match) {
    return null;
  }

  const arrayStart = match.index + match[0].length;
  let depth = 1;
  let arrayEnd = -1;

  for (let i = arrayStart; i < content.length; i++) {
    if (content[i] === '[') {
      depth++;
    }
    if (content[i] === ']') {
      depth--;
    }
    if (depth === 0) {
      arrayEnd = i;
      break;
    }
  }

  if (arrayEnd === -1) {
    return null;
  }

  const body = content.substring(arrayStart, arrayEnd);
  if (!body.trim()) {
    return null;
  }

  const tokens = tokenize(body);

  // Need at least 2 entries to sort
  const entryCount = tokens.filter((t) => t.type === 'entry').length;
  if (entryCount <= 1) {
    return null;
  }

  const sorted = sortTokens(tokens);
  const newBody = rebuild(sorted);

  if (body === newBody) {
    return null;
  }

  return (
    content.substring(0, arrayStart) + newBody + content.substring(arrayEnd)
  );
}

async function processFile(filePath: string): Promise<boolean> {
  let content = await Bun.file(filePath).text();
  let changed = false;

  for (const prop of ARRAY_PROPS) {
    const result = sortDecoratorArray(content, prop);
    if (result !== null) {
      content = result;
      changed = true;
      if (VERBOSE) {
        logger.log(`  sorted ${prop}`);
      }
    }
  }

  if (changed && !DRY_RUN) {
    await Bun.write(filePath, content);
  }

  return changed;
}

async function main(): Promise<void> {
  const glob = new Glob('apps/server/**/*.module.ts');
  const cwd = process.cwd();
  const files: string[] = [];

  for await (const path of glob.scan({ absolute: true, cwd })) {
    if (path.endsWith('/app.module.ts')) {
      continue;
    }
    files.push(path);
  }

  files.sort();

  let changedCount = 0;

  for (const file of files) {
    const relativePath = file.replace(`${cwd}/`, '');
    const changed = await processFile(file);
    if (changed) {
      changedCount++;
      logger.log(`${DRY_RUN ? '[dry-run] ' : ''}sorted: ${relativePath}`);
    }
  }

  logger.log(
    `\n${DRY_RUN ? '[dry-run] ' : ''}${changedCount} file(s) sorted out of ${files.length} module files scanned.`,
  );
}

main();
