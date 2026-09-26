/**
 * Reads a file from the sibling `genfeedai/benchmark` checkout at the pinned
 * revision, so a pinned copy can be proven verbatim. The sibling is found
 * from the main checkout (via the shared git dir), which also works inside a
 * `.worktrees/*` worktree. Returns null when there is no sibling checkout or
 * it lacks the revision — CI has neither, and the check is then skipped.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BENCH_REVISION } from './schema';

export function findBenchCheckout(): string | null {
  try {
    const commonDir = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8' },
    ).trim();
    const candidate = resolve(dirname(dirname(commonDir)), 'benchmark');
    return existsSync(resolve(candidate, '.git')) ? candidate : null;
  } catch {
    return null;
  }
}

export function readBenchFileAtRevision(
  path: string,
  revision: string = BENCH_REVISION,
): string | null {
  const checkout = findBenchCheckout();
  if (!checkout) {
    return null;
  }

  try {
    return execFileSync('git', ['show', `${revision}:${path}`], {
      cwd: checkout,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * Formatter-proof comparison: line wrapping and the trailing commas a
 * formatter adds when it wraps carry no meaning in the schema.
 */
export function normalizeSource(source: string): string {
  return source.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, '');
}
