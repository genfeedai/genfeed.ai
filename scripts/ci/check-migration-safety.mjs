import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  destructiveOperations,
  validateContract,
} from './migration-safety.mjs';

const MIGRATIONS = 'packages/prisma/prisma/migrations';

// Purely static PR-time pass of the deploy migration guard: no network, no
// release lookup. The release/Prisma-client comparison stays in deploy.
// Returns null when no base was requested (e.g. a push run): the caller must
// say it skipped. A requested base that cannot be resolved fails closed.
export function resolveBase({ base, env = process.env }) {
  return base || env.CI_BASE_SHA || null;
}

export function changedMigrationFiles({ base, env, git }) {
  const requested = resolveBase({ base, env });
  if (!requested) return null;
  try {
    git(['rev-parse', '--verify', '--quiet', `${requested}^{commit}`]);
  } catch {
    throw new Error(
      `Cannot resolve migration diff base "${requested}"; fetch full history (fetch-depth: 0)`,
    );
  }
  let out;
  try {
    out = git([
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      `${requested}...HEAD`,
      '--',
      MIGRATIONS,
    ]);
  } catch (error) {
    throw new Error(
      `git diff ${requested}...HEAD failed (no merge base or missing history): ${error.message}`,
    );
  }
  return out.split('\n').filter((file) => file.endsWith('/migration.sql'));
}

export function checkMigrationFiles({ files, read }) {
  const failures = [];
  for (const file of files) {
    try {
      const sql = read(file);
      // Throws on dynamic EXECUTE, unsupported schemas, malformed SQL, and
      // destructive operations without exactly one contract marker.
      destructiveOperations(sql);
      validateContract(sql);
    } catch (error) {
      failures.push({ file, message: error.message });
    }
  }
  return failures;
}

export function run({
  base,
  cwd = process.cwd(),
  env = process.env,
  git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(),
  read = (file) => readFileSync(`${cwd}/${file}`, 'utf8'),
} = {}) {
  const files = changedMigrationFiles({ base, env, git });
  if (files === null) return { files: null, failures: [] };
  return { files, failures: checkMigrationFiles({ files, read }) };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({ options: { base: { type: 'string' } } });
  let result;
  try {
    result = run({ base: values.base });
  } catch (error) {
    process.stderr.write(`Migration safety: ${error.message}\n`);
    process.exit(1);
  }
  const { files, failures } = result;
  if (files === null) {
    process.stdout.write(
      'Migration safety (static) SKIPPED: no diff base (push run); pull requests are checked before merge.\n',
    );
  } else if (failures.length) {
    for (const { file, message } of failures)
      process.stderr.write(`Migration safety: ${file}: ${message}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Migration safety (static) verified ${files.length} added/changed migration(s).\n`,
    );
  }
}
