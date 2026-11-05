/**
 * Guardrail: a pull request may not grow a ratchet baseline (#7137).
 *
 * `check-cross-org-unsafe` and `check-tenant-scope` fail on any call site
 * missing from their baselines, but the baseline sits in the same diff as the
 * code, so a PR can go green by appending its own violation. This guard
 * compares the baselines on this branch with the ones on the base commit and
 * fails when an entry appears that the base did not already carry. Shrinking
 * and relocating (a line number moving inside the same file) stay green.
 *
 *   bun run check:ratchet-growth [--base <ref>]
 *
 * The base defaults to `origin/master`. CI passes the Plan job's base SHA.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const MISSING_AT_REF_ERROR_PATTERN =
  /exists on disk, but not in|does not exist in/;

export type RatchetSource = {
  /** Key for every baseline entry. Equal keys are the same exception. */
  entryKeys: (content: string) => string[];
  file: string;
  /** Names the call to use instead of appending to the baseline. */
  instead: string;
  name: string;
};

export type RatchetGrowth = {
  added: number;
  key: string;
  source: RatchetSource;
};

type TenantScopeBaselineFile = {
  entries: Array<{
    delegate: string;
    file: string;
    method: string;
    model: string;
    reason: string;
  }>;
};

/** String-literal properties of every object literal in a baseline module. */
function objectLiteralStrings(content: string): Array<Map<string, string>> {
  const sourceFile = ts.createSourceFile(
    'baseline.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const literals: Array<Map<string, string>> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const strings = new Map<string, string>();

      for (const property of node.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          ts.isStringLiteralLike(property.initializer)
        ) {
          strings.set(property.name.text, property.initializer.text);
        }
      }

      literals.push(strings);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return literals;
}

/**
 * The cross-org baseline is a TypeScript module of `{ file, line }` entries.
 * The line moves whenever the file is edited, so the file alone is the key.
 * Read from the syntax tree, so a `file: '...'` inside a comment is not an entry.
 */
export function crossOrgEntryKeys(content: string): string[] {
  return objectLiteralStrings(content).flatMap((strings) => {
    const file = strings.get('file');

    return file === undefined ? [] : [file];
  });
}

/**
 * The tenant-scope baseline is JSON. The fingerprint changes with the query
 * text, so it is left out of the key: editing a baselined query is not growth.
 */
export function tenantScopeEntryKeys(content: string): string[] {
  const parsed = JSON.parse(content) as TenantScopeBaselineFile;

  return parsed.entries.map((entry) =>
    [entry.file, entry.model, entry.delegate, entry.method, entry.reason].join(
      '|',
    ),
  );
}

/** One entry per baselined DTO property, in either property order. */
export function authorityFieldEntryKeys(content: string): string[] {
  return objectLiteralStrings(content).flatMap((strings) => {
    const file = strings.get('file');
    const property = strings.get('property');

    return file === undefined || property === undefined
      ? []
      : [`${file}|${property}`];
  });
}

export const RATCHET_SOURCES: readonly RatchetSource[] = [
  {
    entryKeys: crossOrgEntryKeys,
    file: 'scripts/architecture/cross-org-unsafe.baseline.ts',
    instead:
      'scope the query with organizationId and isDeleted: false instead of adding a crossOrgUnsafe() call site',
    name: 'crossOrgUnsafe call sites',
  },
  {
    entryKeys: authorityFieldEntryKeys,
    file: 'scripts/architecture/authority-field-optional.baseline.ts',
    instead:
      "use @IsOmittable() from '@api/helpers/validation/is-omittable.validator' instead of @IsOptional() on the field",
    name: '@IsOptional() authority fields',
  },
  {
    entryKeys: tenantScopeEntryKeys,
    file: 'scripts/architecture/tenant-scope-baseline.json',
    instead:
      'add organizationId and isDeleted: false to the query instead of baselining it',
    name: 'tenant-scope findings',
  },
];

function countKeys(keys: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

/** Entries present more often in `head` than in `base`; none when the base has no such baseline yet. */
export function findRatchetGrowth(
  source: RatchetSource,
  baseContent: string | null,
  headContent: string,
): RatchetGrowth[] {
  // A ratchet the base never had cannot have grown: it is being introduced.
  if (baseContent === null) {
    return [];
  }

  const baseCounts = countKeys(source.entryKeys(baseContent));
  const headCounts = countKeys(source.entryKeys(headContent));
  const growth: RatchetGrowth[] = [];

  for (const [key, headCount] of headCounts) {
    const added = headCount - (baseCounts.get(key) ?? 0);

    if (added > 0) {
      growth.push({ added, key, source });
    }
  }

  return growth.sort((left, right) => left.key.localeCompare(right.key));
}

/** The file's content at `ref`, or null when the base did not have it yet. */
export function readFileAtRef(
  rootDir: string,
  ref: string,
  file: string,
): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '');

    if (MISSING_AT_REF_ERROR_PATTERN.test(stderr)) {
      return null;
    }

    throw new Error(
      `Could not read ${file} at ${ref}. Fetch the base commit first (git fetch origin master).\n${stderr.trim()}`,
      { cause: error },
    );
  }
}

export type RatchetGrowthOptions = {
  base: string;
  rootDir?: string;
  sources?: readonly RatchetSource[];
};

export function runRatchetGrowthCheck(
  options: RatchetGrowthOptions,
): RatchetGrowth[] {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());

  return (options.sources ?? RATCHET_SOURCES).flatMap((source) =>
    findRatchetGrowth(
      source,
      readFileAtRef(rootDir, options.base, source.file),
      readFileSync(path.join(rootDir, source.file), 'utf8'),
    ),
  );
}

function parseBase(argv: readonly string[]): string {
  const index = argv.indexOf('--base');

  if (index === -1) {
    return 'origin/master';
  }

  const value = argv[index + 1];

  if (!value) {
    throw new Error('--base needs a ref or commit SHA.');
  }

  return value;
}

if (import.meta.main) {
  try {
    const base = parseBase(process.argv.slice(2));
    const growth = runRatchetGrowthCheck({ base });

    if (growth.length > 0) {
      console.error(
        `check:ratchet-growth: a baseline grew against ${base}. Baselines may only shrink (#7137):`,
      );
      for (const item of growth) {
        console.error(
          `- ${item.source.file} (${item.source.name}): +${item.added} ${item.key}. To fix: ${item.source.instead}. If this is a reviewed platform exception, a maintainer merges it past this check.`,
        );
      }
      process.exit(1);
    }

    console.log(
      `check:ratchet-growth: no baseline grew against ${base} (${RATCHET_SOURCES.length} checked).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check:ratchet-growth: ${message}`);
    process.exit(1);
  }
}
