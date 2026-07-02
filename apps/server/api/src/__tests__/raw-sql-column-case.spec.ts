import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the raw-SQL column-case bug class (#574 sibling hunt, #543).
 *
 * Prisma tables ARE snake_case (every model carries `@@map("snake_table")`), but
 * almost all COLUMNS are camelCase with NO `@map`, so Prisma creates them as
 * double-quoted camelCase identifiers (e.g. `"engagementRate"`, `"brandId"`).
 * Postgres folds UNQUOTED identifiers to lowercase and a camelCase column is only
 * reachable when written double-quoted EXACTLY (`"engagementRate"`). Therefore a
 * raw-SQL string that double-quotes a column in snake_case (`"engagement_rate"`,
 * `"brand_id"`) throws `42703 column does not exist` at runtime — invisible to
 * typecheck, lint and vitest (raw SQL is an opaque string).
 *
 * That exact defect took down every analytics endpoint in production (fixed in
 * `32ac1080e`). This test makes the bug class un-reintroducible: it scans every
 * raw-SQL site under `apps/server/**` and asserts that any double-quoted
 * snake_case identifier is a real DB table (`@@map`) or a `@map`'d column from
 * the Prisma schema — never an un-mapped snake_case column reference.
 *
 * Scope note: SQL is collected by anchoring on the raw-SQL call site itself
 * (`$queryRaw`/`$executeRaw`/`Prisma.sql`/`Prisma.raw`) and reading the template
 * literal or string that follows, with full `${…}`/nested-backtick awareness.
 * That captures keyword-less fragment helpers (`Prisma.sql\`AND "brandId" = …\``)
 * and nested fragments alike, while ignoring ordinary log templates. The one
 * shape it can't see through is an *interpolated* identifier
 * (`Prisma.raw(\`"${column}"\`)`); that column is always a typed string-literal
 * union (e.g. `'brandId' | 'organizationId'`), so the TS type — not this test —
 * is the guard there.
 */

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// apps/server/api/src -> apps/server
const SERVER_ROOT = join(SRC_ROOT, '..', '..');
// apps/server/api/src -> repo root -> packages/prisma/prisma/schema.prisma
const SCHEMA_PATH = join(
  SRC_ROOT,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'prisma',
  'prisma',
  'schema.prisma',
);

const RAW_SQL_MARKERS = [
  '$queryRaw',
  '$executeRaw',
  'Prisma.sql',
  'Prisma.raw',
];

// Longest alternatives first so `$queryRawUnsafe` is not partially matched by
// `$queryRaw`.
const MARKER_PATTERN =
  /\$queryRawUnsafe|\$executeRawUnsafe|\$queryRaw|\$executeRaw|Prisma\.sql|Prisma\.raw/g;

interface SqlViolation {
  file: string;
  identifier: string;
  snippet: string;
}

/**
 * Every legitimate snake_case identifier the raw SQL is allowed to double-quote:
 * `@@map("table")` table names and `@map("column")` mapped column names. Built
 * straight from the schema so it can never drift from the real DB shape.
 */
function buildSnakeAllowlist(): Set<string> {
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  const allow = new Set<string>();
  const mapPattern = /@@?map\(\s*"([^"]+)"\s*\)/g;
  let match: RegExpExecArray | null = mapPattern.exec(schema);
  while (match !== null) {
    allow.add(match[1]);
    match = mapPattern.exec(schema);
  }
  return allow;
}

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (
      entry.startsWith('.') ||
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'generated' ||
      entry === 'test'
    ) {
      continue;
    }
    const full = join(dir, entry);
    // `throwIfNoEntry: false` keeps dangling symlinks (e.g. per-service `.env`
    // links) from aborting the walk — they return undefined and are skipped.
    const stat = statSync(full, { throwIfNoEntry: false });
    if (!stat) {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...walkTsFiles(full));
    } else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.d.ts') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.e2e-spec.ts')
    ) {
      results.push(full);
    }
  }
  return results;
}

/** Read a single-/double-quoted string literal; return the index past its close. */
function readStringLiteral(src: string, start: number): number {
  const quote = src[start];
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === quote) {
      return i + 1;
    }
    i++;
  }
  return i;
}

/**
 * Read a template literal starting at the opening backtick. Returns its literal
 * text (with each `${…}` interpolation collapsed to a space so identifiers never
 * merge) and the index past the closing backtick. Nested templates inside
 * interpolations are skipped here — they are captured independently because each
 * `Prisma.sql\`…\`` fragment is its own marked call site.
 */
function readTemplateLiteral(
  src: string,
  start: number,
): { text: string; end: number } {
  let i = start + 1;
  let text = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      text += src[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (c === '`') {
      return { text, end: i + 1 };
    }
    if (c === '$' && src[i + 1] === '{') {
      i = skipInterpolation(src, i + 2);
      text += ' ';
      continue;
    }
    text += c;
    i++;
  }
  return { text, end: i };
}

/** Skip a `${…}` interpolation body (balanced braces, nested strings/templates). */
function skipInterpolation(src: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '`') {
      i = readTemplateLiteral(src, i).end;
      continue;
    }
    if (c === "'" || c === '"') {
      i = readStringLiteral(src, i);
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
    }
    i++;
  }
  return i;
}

/** Skip a balanced `<…>` generic type argument list (e.g. `$queryRaw<Row[]>`). */
function skipGenerics(src: string, start: number): number {
  if (src[start] !== '<') return start;
  let depth = 0;
  let i = start;
  while (i < src.length) {
    if (src[i] === '<') depth++;
    else if (src[i] === '>') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return i;
}

function skipWhitespace(src: string, start: number): number {
  let i = start;
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

/**
 * Collect raw-SQL text regions by anchoring on each raw-SQL call marker and
 * reading the template literal / string argument that follows it. Handles tagged
 * templates (`$queryRaw\`…\``), the call form (`$queryRaw<T>(Prisma.sql\`…\`)`,
 * `$queryRawUnsafe('…')`) and `Prisma.raw('…')` / `Prisma.raw(\`…\`)`.
 */
function extractSqlRegions(content: string): string[] {
  const regions: string[] = [];
  MARKER_PATTERN.lastIndex = 0;
  let marker: RegExpExecArray | null = MARKER_PATTERN.exec(content);
  while (marker !== null) {
    let i = marker.index + marker[0].length;
    i = skipGenerics(content, i);
    i = skipWhitespace(content, i);
    if (content[i] === '(') {
      i = skipWhitespace(content, i + 1);
    }
    const c = content[i];
    if (c === '`') {
      regions.push(readTemplateLiteral(content, i).text);
    } else if (c === "'" || c === '"') {
      regions.push(content.slice(i + 1, readStringLiteral(content, i) - 1));
    }
    marker = MARKER_PATTERN.exec(content);
  }
  return regions;
}

function findViolationsInRegion(region: string, file: string): SqlViolation[] {
  const violations: SqlViolation[] = [];
  // Double-quoted identifiers, excluding `${...}` interpolations (they carry `$`).
  const idPattern = /"([^"$]+)"/g;
  for (
    let match: RegExpExecArray | null = idPattern.exec(region);
    match !== null;
    match = idPattern.exec(region)
  ) {
    const id = match[1];
    // camelCase / single lowercase word — folding is a no-op, resolves fine.
    if (!id.includes('_')) continue;
    // Prisma implicit-relation artifacts (junction tables / `"A"`/`"B"` cols).
    if (id.startsWith('_')) continue;
    // Only snake_case (lowercase + underscores) is the bug shape we guard.
    if (!/^[a-z][a-z0-9_]*$/.test(id)) continue;
    // A real DB table (@@map) or mapped column (@map) — legitimately snake_case.
    if (allowlist.has(id)) continue;
    // A double-quoted alias (`... AS "some_alias"`) is an output label, not a
    // column lookup — harmless, never hits the catalog.
    if (/\bas\s+$/i.test(region.slice(0, match.index))) continue;

    const start = Math.max(0, match.index - 30);
    const end = Math.min(region.length, match.index + id.length + 10);
    violations.push({
      file,
      identifier: id,
      snippet: region.slice(start, end).replace(/\s+/g, ' ').trim(),
    });
  }
  return violations;
}

const allowlist = buildSnakeAllowlist();

describe('raw SQL column-case safety (#543/#574 regression guard)', () => {
  const files = walkTsFiles(SERVER_ROOT).filter((file) => {
    const content = readFileSync(file, 'utf-8');
    return RAW_SQL_MARKERS.some((marker) => content.includes(marker));
  });

  const regionsByFile = files
    .map((file) => ({
      file,
      regions: extractSqlRegions(readFileSync(file, 'utf-8')),
    }))
    .filter((entry) => entry.regions.length > 0);

  it('derives a non-empty snake_case allowlist from the Prisma schema', () => {
    // Sanity: the schema is readable and mapped. If this is empty the allowlist
    // builder broke and every check below would be meaningless.
    expect(allowlist.size).toBeGreaterThan(50);
    expect(allowlist.has('post_analytics')).toBe(true);
  });

  it('actually finds the known raw-SQL aggregation sites (guard is not a no-op)', () => {
    // If extraction silently breaks, the violation check would pass vacuously.
    // Pin a floor so a refactor that hides the SQL fails loudly here instead.
    expect(regionsByFile.length).toBeGreaterThanOrEqual(5);
    const totalRegions = regionsByFile.reduce(
      (sum, entry) => sum + entry.regions.length,
      0,
    );
    expect(totalRegions).toBeGreaterThanOrEqual(15);
  });

  it('never double-quotes a snake_case column that is not a real table/@map column', () => {
    const violations: SqlViolation[] = [];
    for (const { file, regions } of regionsByFile) {
      const rel = relative(SERVER_ROOT, file);
      for (const region of regions) {
        violations.push(...findViolationsInRegion(region, rel));
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}: "${v.identifier}"  →  …${v.snippet}…`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} snake_case identifier(s) double-quoted in raw SQL that are not ` +
          `Prisma @@map tables or @map columns. Postgres stores Genfeed columns as quoted camelCase ` +
          `(no @map), so these throw "42703 column does not exist" at runtime (the #574/analytics bug ` +
          `class). Use the quoted camelCase column name (e.g. "engagementRate") instead:\n${report}`,
      );
    }

    expect(violations).toEqual([]);
  });
});
