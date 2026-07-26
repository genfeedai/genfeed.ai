#!/usr/bin/env bun
/**
 * Strip dead Clerk-era variables from local, untracked env files.
 *
 * Clerk was fully removed from the codebase in #769 — there are zero `@clerk`
 * imports and zero `CLERK_*` readers left. The values still sitting in local
 * `.env*` files are therefore dead, but they are *live vendor credentials*, and
 * this repository is public. Anything that leaks one is indexed before it can be
 * rotated. This script removes them from disk.
 *
 * Safety contract:
 * - Never prints a variable's value. Output is file paths, variable names, and
 *   counts only.
 * - Never writes a `.bak` copy. A backup would just re-litter the disk with the
 *   secret this script exists to delete.
 * - Dry-run by default. Pass `--write` to mutate files.
 * - Skips anything tracked by git: env files are gitignored by policy, so a
 *   tracked match means something is already wrong and needs a human.
 *
 * Usage:
 *   bun run scripts/strip-clerk-env-vars.ts            # report only
 *   bun run scripts/strip-clerk-env-vars.ts --write    # remove the lines
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');
const IS_WRITE = process.argv.includes('--write');

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
]);

/** Matches `CLERK_X=`, `NEXT_PUBLIC_CLERK_X=`, and `export`-prefixed forms. */
const CLERK_ASSIGNMENT = /^\s*(?:export\s+)?[A-Z0-9_]*CLERK[A-Z0-9_]*\s*=/;

interface StripResult {
  file: string;
  removedNames: string[];
}

function collectEnvFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectEnvFiles(path, found);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.startsWith('.env')) continue;
    if (entry.name.endsWith('.example') || entry.name.endsWith('.sample'))
      continue;
    if (statSync(path).size > 1_000_000) continue;

    found.push(path);
  }

  return found;
}

function variableName(line: string): string {
  const [assignment] = line.split('=');
  return assignment.replace(/^\s*(?:export\s+)?/, '').trim();
}

function stripFile(path: string): StripResult | null {
  const original = readFileSync(path, 'utf8');
  const lines = original.split('\n');
  const kept: string[] = [];
  const removedNames: string[] = [];

  for (const line of lines) {
    if (CLERK_ASSIGNMENT.test(line)) {
      removedNames.push(variableName(line));
      continue;
    }
    kept.push(line);
  }

  if (removedNames.length === 0) return null;

  if (IS_WRITE) {
    writeFileSync(path, kept.join('\n'), 'utf8');
  }

  return { file: relative(REPO_ROOT, path), removedNames };
}

function main(): void {
  const envFiles = collectEnvFiles(REPO_ROOT);
  const results: StripResult[] = [];

  for (const path of envFiles) {
    const result = stripFile(path);
    if (result) results.push(result);
  }

  const verb = IS_WRITE ? 'Removed' : 'Would remove';

  if (results.length === 0) {
    process.stdout.write(
      `No Clerk-era variables found across ${envFiles.length} env file(s).\n`,
    );
    return;
  }

  let total = 0;
  for (const { file, removedNames } of results) {
    total += removedNames.length;
    process.stdout.write(`${file}\n`);
    for (const name of removedNames) {
      process.stdout.write(`  ${verb.toLowerCase()}: ${name}\n`);
    }
  }

  process.stdout.write(
    `\n${verb} ${total} Clerk-era assignment(s) across ${results.length} file(s).\n`,
  );

  if (!IS_WRITE) {
    process.stdout.write('Re-run with --write to apply.\n');
    return;
  }

  process.stdout.write(
    'These credentials were live. Revoke them in the Clerk dashboard — deleting the local copy is not revocation.\n',
  );
}

main();
