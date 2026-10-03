import { existsSync, realpathSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import process from 'node:process';
import { Logger } from '@nestjs/common';
import { readFlag, UsageError } from '../../../../../scripts/content-eval/cli';
import { readKeyFile } from './fixture-ids';
import { SYNTHETIC_ANONYMISER_KEY } from './golden-set.constants';
import type {
  GoldenSetExportArgs,
  GoldenSetScope,
  GoldenSetScopeSnapshot,
} from './golden-set.types';
import { buildGoldenSet, writeGoldenSetFiles } from './golden-set-export';
import { PrismaGoldenSetReader } from './prisma-golden-set-reader';
import { buildSyntheticSnapshot } from './synthetic-seed';

const logger = new Logger('ExportGoldenSet');
const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
function required(argv: string[], name: string): string {
  const value = readFlag(argv, name);
  if (value === undefined || value.trim().length === 0)
    throw new UsageError(`--${name} is required`);
  return value;
}
function outside(path: string, name: string): void {
  const rel = relative(REPO_ROOT, resolve(path));
  const isOutside =
    rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (!isOutside)
    throw new UsageError(`--${name} must resolve outside the repository`);
}
function resolvedOutputPath(path: string): string {
  let ancestor = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(ancestor)) {
    suffix.unshift(basename(ancestor));
    const parent = dirname(ancestor);
    if (parent === ancestor)
      throw new UsageError('Cannot resolve output directory');
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), ...suffix);
}
function date(raw: string, name: string): Date {
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw
  )
    throw new UsageError(`--${name} must be YYYY-MM-DD`);
  return parsed;
}
export function parseExportArgs(argv: string[]): GoldenSetExportArgs {
  const source = required(argv, 'source');
  const outDir = resolve(required(argv, 'out-dir'));
  if (source === 'synthetic') return { source, outDir };
  if (source !== 'database')
    throw new UsageError('--source must be synthetic or database');
  const authorization = required(argv, 'authorization');
  if (
    !/^https:\/\/github\.com\/genfeedai\/genfeed\.ai\/issues\/4923#issuecomment-\d+$/.test(
      authorization,
    )
  )
    throw new UsageError('--authorization must be a #4923 issue comment URL');
  const keyFile = required(argv, 'key-file');
  if (!isAbsolute(keyFile)) throw new UsageError('--key-file must be absolute');
  outside(keyFile, 'key-file');
  outside(outDir, 'out-dir');
  const from = date(required(argv, 'from'), 'from');
  const to = date(required(argv, 'to'), 'to');
  if (from >= to) throw new UsageError('--from must be before --to');
  const scopes = new Map<string, GoldenSetScope>();
  const allBrands = new Set<string>();
  for (const argument of argv.filter((argument) =>
    argument.startsWith('--scope='),
  )) {
    const parts = argument.slice('--scope='.length).split('/');
    const organizationId = parts[0];
    const brandId = parts[1];
    if (!organizationId || parts.length > 2 || (parts.length === 2 && !brandId))
      throw new UsageError('--scope must be orgId or orgId/brandId');
    const scope = scopes.get(organizationId) ?? {
      organizationId,
      brandIds: [],
    };
    if (brandId === undefined) allBrands.add(organizationId);
    else if (!scope.brandIds.includes(brandId)) scope.brandIds.push(brandId);
    scopes.set(organizationId, scope);
  }
  if (scopes.size === 0)
    throw new UsageError('At least one --scope is required');
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    source,
    outDir,
    keyFile: resolve(keyFile),
    authorization,
    window: { from, to },
    scopes: [...scopes.values()]
      .map((scope) => ({
        ...scope,
        brandIds: allBrands.has(scope.organizationId)
          ? []
          : scope.brandIds.sort(compare),
      }))
      .sort((a, b) => compare(a.organizationId, b.organizationId)),
  };
}
export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const args = parseExportArgs(argv);
  let key = SYNTHETIC_ANONYMISER_KEY;
  let snapshots: GoldenSetScopeSnapshot[];
  if (args.source === 'synthetic') snapshots = [buildSyntheticSnapshot()];
  else {
    outside(resolvedOutputPath(args.outDir), 'out-dir');
    key = readKeyFile(args.keyFile, REPO_ROOT);
    const { createGoldenSetDatabaseClient } = await import('./database-client');
    const database = createGoldenSetDatabaseClient();
    try {
      const reader = new PrismaGoldenSetReader(database.client);
      snapshots = [];
      for (const scope of args.scopes)
        snapshots.push(await reader.readScope(scope, args.window));
    } finally {
      await database.disconnect();
    }
  }
  const result = buildGoldenSet({
    snapshots,
    key,
    visibility: args.source === 'synthetic' ? 'synthetic' : 'private',
    window: args.source === 'synthetic' ? null : args.window,
  });
  writeGoldenSetFiles(args.outDir, result);
  const files = result.report.kinds.map((kind) => ({
    contentKind: kind.contentKind,
    rows: kind.rows,
  }));
  logger.log(
    `Exported ${files.reduce((sum, file) => sum + file.rows, 0)} rows in ${result.files.length} files`,
  );
  process.stdout.write(
    `${JSON.stringify({ summary: { files, excluded: result.report.excluded } })}\n`,
  );
}
if (import.meta.main) {
  main().catch(() => {
    logger.error('Golden-set export failed');
    process.exit(1);
  });
}
