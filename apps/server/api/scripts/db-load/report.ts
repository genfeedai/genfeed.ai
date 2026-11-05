/**
 * Builds the before/after report from the per-scale result files.
 *
 *   bun --tsconfig-override=tsconfig.json run scripts/db-load/report.ts --dir db-load-results
 *
 * Reads `<label>-<scale>x.json` (label = before | after), writes `report.json`
 * and a self-contained `report.html` (inline SVG, no network) next to them.
 *
 * Statistics: per query and scale we compare the `before` and `after` latency
 * samples with a two-sided Mann-Whitney U test, adjusted across all
 * comparisons with Holm-Bonferroni, and report the median speed-up with a 95%
 * bootstrap CI. A change counts as "significant" only when the adjusted p is
 * below 0.01 AND the speed-up CI excludes 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderHtml } from './report-html';
import {
  type Comparison,
  compareSamples,
  holmAdjust,
  type Summary,
  summarize,
} from './stats';

type Plan = {
  bufferHit: number;
  bufferRead: number;
  executionMs: number;
  externalSort: boolean;
  nodes: string[];
  rowsRemovedByFilter: number;
  seqScans: string[];
  sql: string;
};
type RawResult = {
  description: string;
  errors: { count: number; first?: string; timeouts: number };
  group: string;
  id: string;
  kind: 'typical' | 'whale' | 'global';
  plans: Plan[];
  samples: number[];
  source: string;
  statementsPerCall: number;
  summary: Summary | null;
};
type RawFile = {
  config: Record<string, number>;
  db: {
    rowCounts: { n: number; relname: string }[];
    size: string;
    version: string;
  };
  host: Record<string, string | number>;
  results: RawResult[];
  scale: number;
  source: { branch: string; commit: string; dirty: boolean };
  tenants: number;
  when: string;
};

export type Side = {
  errors: number;
  firstError?: string;
  plans: Plan[];
  statementsPerCall: number;
  summary: Summary | null;
  timeouts: number;
};
export type Cell = {
  after?: Side;
  before?: Side;
  cmp?: Comparison & { significant: boolean };
};
export type Row = {
  cells: Record<string, Cell>;
  description: string;
  group: string;
  id: string;
  kind: string;
  source: string;
};

const SIGNIFICANCE = 0.01;

function side(r: RawResult | undefined): Side | undefined {
  if (!r) return undefined;
  return {
    errors: r.errors.count,
    firstError: r.errors.first,
    plans: r.plans,
    statementsPerCall: r.statementsPerCall,
    summary: r.samples.length >= 3 ? summarize(r.samples) : null,
    timeouts: r.errors.timeouts,
  };
}

function main(): void {
  const dirArg = process.argv.indexOf('--dir');
  const dir = path.resolve(
    dirArg >= 0 ? process.argv[dirArg + 1] : 'db-load-results',
  );
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^(before|after)-\d+x\.json$/.test(f));
  const loaded = new Map<string, RawFile>();
  for (const f of files)
    loaded.set(
      f.replace('.json', ''),
      JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')),
    );
  const scales = [
    ...new Set(files.map((f) => Number(/-(\d+)x/.exec(f)?.[1]))),
  ].sort((a, b) => a - b);

  const rows = new Map<string, Row>();
  const comparisons: {
    cmp: Comparison & { significant: boolean };
    cell: Cell;
  }[] = [];
  const samplesOf = (label: string, scale: number, id: string, kind: string) =>
    loaded
      .get(`${label}-${scale}x`)
      ?.results.find((r) => r.id === id && r.kind === kind);

  for (const [, file] of loaded) {
    for (const r of file.results) {
      const key = `${r.id}|${r.kind}`;
      if (!rows.has(key))
        rows.set(key, {
          cells: {},
          description: r.description,
          group: r.group,
          id: r.id,
          kind: r.kind,
          source: r.source,
        });
    }
  }
  for (const row of rows.values()) {
    for (const scale of scales) {
      const b = samplesOf('before', scale, row.id, row.kind);
      const a = samplesOf('after', scale, row.id, row.kind);
      const cell: Cell = { after: side(a), before: side(b) };
      if (b && a && b.samples.length >= 10 && a.samples.length >= 10) {
        const cmp = {
          ...compareSamples(b.samples, a.samples, scale),
          significant: false,
        };
        cell.cmp = cmp;
        comparisons.push({ cell, cmp });
      }
      row.cells[String(scale)] = cell;
    }
  }
  holmAdjust(comparisons.map((c) => c.cmp));
  for (const { cmp } of comparisons) {
    cmp.significant =
      cmp.adjustedP < SIGNIFICANCE &&
      (cmp.speedupCi.low > 1 || cmp.speedupCi.high < 1);
  }

  const any = [...loaded.values()][0];
  const data = {
    comparisons: comparisons.length,
    config: any?.config,
    db: Object.fromEntries(
      scales.map((s) => [
        s,
        loaded.get(`before-${s}x`)?.db ?? loaded.get(`after-${s}x`)?.db,
      ]),
    ),
    generatedAt: new Date().toISOString(),
    host: any?.host,
    rows: [...rows.values()],
    scales,
    source: {
      after: loaded.get(`after-${scales[0]}x`)?.source,
      before: loaded.get(`before-${scales[0]}x`)?.source,
    },
    tenants: Object.fromEntries(
      scales.map((s) => [
        s,
        (loaded.get(`before-${s}x`) ?? loaded.get(`after-${s}x`))?.tenants,
      ]),
    ),
  };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(data));
  fs.writeFileSync(path.join(dir, 'report.html'), renderHtml(data));
  process.stdout.write(
    `report: ${rows.size} query rows, ${comparisons.length} before/after comparisons -> ${dir}/report.html\n`,
  );
}

main();
