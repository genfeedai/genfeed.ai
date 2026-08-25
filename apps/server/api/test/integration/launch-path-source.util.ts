import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source resolution for the hermetic launch-path contracts.
 *
 * A contract that pins its subject to a hardcoded path turns an ordinary file
 * move into a fake product regression: #3508 relocated
 * `scheduleReplyPostWatchAfterPublish` from `cron.posts.service.ts` to
 * `scheduled-post-delivery.service.ts` and reddened the release Full Suite
 * while the production behaviour was intact. Contracts resolve their subject
 * by its exported declaration inside an owning subtree instead, so the file may
 * move freely and only a real rename or deletion breaks the contract.
 *
 * `readRepo` stays for artifacts where the PATH IS the contract — migrations,
 * the Prisma schema, `.gitignore`, agent memory, tier manifests.
 */
const here = dirname(fileURLToPath(import.meta.url));
// apps/server/api/test/integration → monorepo root
export const repoRoot = join(here, '../../../../..');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.mjs', '.js'];

/**
 * Declaration artifacts re-export the same names as the implementation they
 * describe (`export declare class Foo`), so leaving them in the candidate set
 * would turn a stray checked-in `.d.ts` into a permanent ambiguous lookup.
 */
const DECLARATION_ARTIFACT_EXTENSIONS = ['.d.ts', '.d.tsx', '.d.mts', '.d.cts'];

/**
 * Generated or vendored trees never own a production declaration. Dot
 * directories (`.next`, `.turbo`, `.vercel`) are skipped wholesale.
 */
const IGNORED_DIRECTORIES = new Set([
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
]);

function isIgnoredDirectory(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRECTORIES.has(name);
}

export type SourceLookup = {
  /**
   * Subtree that owns the declaration, relative to the monorepo root (an
   * absolute path is used as-is). Pick the narrowest tree that keeps the
   * declaration unambiguous — a service's collection, a package's `src` — so a
   * move inside that tree stays invisible to the contract.
   */
  readonly root: string;
};

function resolveRoot(root: string): string {
  return isAbsolute(root) ? root : join(repoRoot, root);
}

function isSourceFile(fileName: string): boolean {
  if (
    DECLARATION_ARTIFACT_EXTENSIONS.some((extension) =>
      fileName.endsWith(extension),
    )
  ) {
    return false;
  }

  return SOURCE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function collectSourceFiles(directory: string, collected: string[]): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!isIgnoredDirectory(entry.name)) {
        collectSourceFiles(join(directory, entry.name), collected);
      }

      continue;
    }

    if (entry.isFile() && isSourceFile(entry.name)) {
      collected.push(join(directory, entry.name));
    }
  }

  return collected;
}

// Contracts resolve ~30 declarations across a handful of shared subtrees, so
// each tree is walked once and each file is read once per suite run.
const sourceFilesByRoot = new Map<string, string[]>();
const sourceByPath = new Map<string, string>();

function listSourceFiles(absoluteRoot: string): string[] {
  const cached = sourceFilesByRoot.get(absoluteRoot);

  if (cached) {
    return cached;
  }

  // Sorted so an ambiguous-declaration failure lists candidates in a stable
  // order regardless of filesystem iteration order.
  const files = collectSourceFiles(absoluteRoot, []).sort();
  sourceFilesByRoot.set(absoluteRoot, files);

  return files;
}

function readSourceFile(absolutePath: string): string {
  const cached = sourceByPath.get(absolutePath);

  if (cached !== undefined) {
    return cached;
  }

  const source = readFileSync(absolutePath, 'utf8');
  sourceByPath.set(absolutePath, source);

  return source;
}

/**
 * Matches a top-level export of `declaration`. Anchored to the start of a line
 * so an import, a re-export list, or a call site can never win the lookup.
 */
function buildDeclarationPattern(declaration: string): RegExp {
  return new RegExp(
    `^export\\s+(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:class|function|const|let|var|type|interface|enum)\\s+${declaration}\\b`,
    'm',
  );
}

function describeCandidates(candidates: string[]): string {
  return candidates
    .map((candidate) => `  - ${relative(repoRoot, candidate)}`)
    .join('\n');
}

/**
 * Absolute path of the single file under `root` that exports `declaration`.
 * Throws with the searched subtree — and every candidate on an ambiguous
 * match — so a failure reads as "the contract needs a new root or name",
 * never as a silent pass on the wrong file.
 */
export function resolveSourcePathOf(
  declaration: string,
  { root }: SourceLookup,
): string {
  const absoluteRoot = resolveRoot(root);
  const pattern = buildDeclarationPattern(declaration);
  const candidates = listSourceFiles(absoluteRoot).filter((file) =>
    pattern.test(readSourceFile(file)),
  );
  const [onlyCandidate] = candidates;

  if (onlyCandidate && candidates.length === 1) {
    return onlyCandidate;
  }

  const searched = `${relative(repoRoot, absoluteRoot)}${sep}`;

  if (candidates.length === 0) {
    throw new Error(
      `No exported declaration named "${declaration}" under ${searched}. ` +
        'It was renamed, deleted, or moved out of this subtree — update the contract to match the code.',
    );
  }

  throw new Error(
    `Ambiguous declaration "${declaration}" under ${searched} — ${candidates.length} candidates:\n` +
      `${describeCandidates(candidates)}\n` +
      'Narrow the contract root to the subtree that owns the behaviour.',
  );
}

/** Source of the single file under `root` that exports `declaration`. */
export function readSourceOf(
  declaration: string,
  lookup: SourceLookup,
): string {
  return readSourceFile(resolveSourcePathOf(declaration, lookup));
}

/** Verbatim read for artifacts whose path is itself the contract. */
export function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}
