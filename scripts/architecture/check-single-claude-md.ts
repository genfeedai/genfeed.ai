/**
 * Guardrail: the repository root holds the only `CLAUDE.md`.
 *
 * Nested copies under `apps/*` or `packages/*` were a context-budget trick.
 * Codex and Cursor load `.agents/memory/` from the root, so package-local
 * rules belong there, not in a second instruction file a subdirectory walk
 * (or `next dev` with `agentRules` on) can create or rewrite.
 *
 * The root `CLAUDE.md` only imports `AGENTS.md`, the single rule file, so
 * Claude Code and Codex read the same rules.
 *
 *   bun run check:single-claude-md
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const ROOT_CLAUDE_MD = 'CLAUDE.md';

const DEFAULT_IGNORE_GLOBS = [
  '**/coverage/**',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
];

export type SingleClaudeMdOptions = {
  ignoreGlobs?: string[];
  rootDir?: string;
};

/** Returns every `CLAUDE.md` other than the repository-root file. */
export function findNestedClaudeMd(
  options: SingleClaudeMdOptions = {},
): string[] {
  return globSync('**/CLAUDE.md', {
    cwd: options.rootDir ?? process.cwd(),
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file !== ROOT_CLAUDE_MD)
    .sort((left, right) => left.localeCompare(right));
}

/** True when the root `CLAUDE.md` exists and imports `AGENTS.md` on its own line. */
export function importsAgentsMd(rootDir: string = process.cwd()): boolean {
  const claudeMd = path.join(rootDir, ROOT_CLAUDE_MD);

  if (!existsSync(claudeMd)) {
    return false;
  }

  return readFileSync(claudeMd, 'utf8')
    .split(/\r?\n/)
    .some((line) => line.trim() === '@AGENTS.md');
}

if (import.meta.main) {
  if (!importsAgentsMd()) {
    console.error(
      'Root CLAUDE.md must import AGENTS.md (a line reading "@AGENTS.md"): AGENTS.md is the single rule file.',
    );
    process.exit(1);
  }

  const nested = findNestedClaudeMd();

  if (nested.length > 0) {
    console.error('Nested CLAUDE.md files found:');
    for (const file of nested) {
      console.error(
        `- ${file}: only the root CLAUDE.md exists; put package rules in .agents/memory/.`,
      );
    }
    process.exit(1);
  }

  console.log('Single CLAUDE.md guard passed.');
}
