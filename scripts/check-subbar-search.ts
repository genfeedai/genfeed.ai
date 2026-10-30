import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

/**
 * Every list page searches through the shared `SearchField`: one persistent
 * field with the page's Filters menu attached inside it. The raw `Searchbar`
 * primitive stays for searches inside modals and pickers, so a page under
 * `apps/app/app` or `packages/pages` that imports it has drifted from the
 * shared subbar.
 */

const INCLUDE_GLOBS = [
  'apps/app/app/**/*.tsx',
  'apps/app/src/features/**/*.tsx',
  'packages/pages/**/*.tsx',
];

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/dist/**',
  '**/node_modules/**',
  // Feature folders that predate the move out of packages/pages (#8684) and
  // were never scanned; they join once their existing findings are fixed.
  'apps/app/src/features/settings/**',
  'apps/app/src/features/workflows/**',
];

/** Searches that live inside a modal or connect flow, not a list page's subbar. */
export const SUBBAR_SEARCH_ALLOWLIST: readonly string[] = [
  'apps/app/src/features/brands/components/integrations/connect-account/ConnectAccountShell.tsx',
  'apps/app/src/features/trends/following/FollowSourceModal.tsx',
];

/** The `@ui` alias or a relative path to the primitive; `\s` spans a line break after `from`. */
const SEARCHBAR_IMPORT =
  /from\s+['"](?:@ui\/primitives\/searchbar|(?:\.{1,2}\/)+(?:[\w.-]+\/)*primitives\/searchbar)['"]/g;

export interface SubbarSearchViolation {
  file: string;
  line: number;
}

export function findSubbarSearchViolations(
  file: string,
  source: string,
): SubbarSearchViolation[] {
  if (SUBBAR_SEARCH_ALLOWLIST.includes(file)) {
    return [];
  }

  return Array.from(source.matchAll(SEARCHBAR_IMPORT), (match) => ({
    file,
    line: source.slice(0, match.index).split('\n').length,
  }));
}

function main(): void {
  const root = process.cwd();
  const files = globSync(INCLUDE_GLOBS, {
    cwd: root,
    ignore: EXCLUDE_GLOBS,
  }).sort();

  const violations = files.flatMap((file) =>
    findSubbarSearchViolations(
      file.split(path.sep).join('/'),
      readFileSync(path.join(root, file), 'utf8'),
    ),
  );

  if (violations.length === 0) {
    console.log('[CheckSubbarSearch] List pages search through SearchField.');
    return;
  }

  for (const violation of violations) {
    console.error(
      `[CheckSubbarSearch] ${violation.file}:${violation.line} imports the raw Searchbar. Use @ui/content/search-field/SearchField, and attach the page's Filters menu inside it.`,
    );
  }
  process.exit(1);
}

if (import.meta.main) {
  main();
}
