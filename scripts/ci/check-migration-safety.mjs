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
export function resolveBase({ base, env = process.env, git }) {
  for (const candidate of [base, env.CI_BASE_SHA, 'origin/master']) {
    if (!candidate) continue;
    try {
      git(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`]);
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function changedMigrationFiles({ base, env, git }) {
  const resolved = resolveBase({ base, env, git });
  // Without a base (shallow clone, detached checkout) scan only the commit
  // under test; never every historical migration.
  const range = resolved ? [`${resolved}...HEAD`] : ['HEAD^', 'HEAD'];
  let out;
  try {
    out = git([
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      ...range,
      '--',
      MIGRATIONS,
    ]);
  } catch {
    return [];
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
  return { files, failures: checkMigrationFiles({ files, read }) };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({ options: { base: { type: 'string' } } });
  const { files, failures } = run({ base: values.base });
  if (failures.length) {
    for (const { file, message } of failures)
      process.stderr.write(`Migration safety: ${file}: ${message}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Migration safety (static) verified ${files.length} added/changed migration(s).\n`,
    );
  }
}
