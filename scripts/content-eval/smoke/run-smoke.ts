/**
 * Generation-type smoke (release and nightly).
 *
 * Usage, from the repo root:
 *   bun scripts/content-eval/smoke/run-smoke.ts --max-credits=300 \
 *     --dispatcher=live --out-dir=reports/content-eval-smoke
 *
 * Flags:
 *   --max-credits=<n>        required hard cap for the whole run (1 credit = $0.01);
 *                            split between cells, each suite aborts at its share
 *   --dispatcher=stub|live   default stub (free); live needs the API environment
 *   --out-dir=<dir>          default reports/content-eval-smoke
 *   --mediums=<list>         default text,image,video; the nightly lane runs text
 *   --require-all=<bool>     default false; a skipped cell fails the run
 *
 * Environment (live): CONTENT_EVAL_GENFEED_API_URL, CONTENT_EVAL_GENFEED_API_KEY,
 * CONTENT_EVAL_KELDER_BRAND_ID for the image and video cells. A media cell with
 * no credentials is reported as skipped, never silently passed.
 *
 * Exit codes: 0 pass · 1 a cell failed or was aborted by its cap, or a cell was
 * skipped under --require-all · 2 usage (including a missing cap).
 */

import { spawn } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { readFlag, UsageError } from '../cli';
import {
  SMOKE_MEDIUMS,
  type SmokeMedium,
} from '../context-coverage/generation-types';
import { contentEvalReportSchema } from '../contracts';
import { readRepoRoot, resolveRepoPath } from '../provenance';
import { buildSmokePlan, type SmokeCell } from './plan';
import { type SmokeCellResult, summariseSmoke } from './summary';

function readBool(argv: string[], name: string, fallback: boolean): boolean {
  const raw = readFlag(argv, name);
  if (raw === undefined) return fallback;
  if (raw !== 'true' && raw !== 'false') {
    throw new UsageError(`--${name} must be true or false, got "${raw}"`);
  }
  return raw === 'true';
}

function readMediums(argv: string[]): SmokeMedium[] {
  const raw = readFlag(argv, 'mediums');
  if (raw === undefined) return [...SMOKE_MEDIUMS];
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const mediums = names.map((name) => {
    const medium = SMOKE_MEDIUMS.find((candidate) => candidate === name);
    if (!medium) {
      throw new UsageError(
        `--mediums entries must be ${SMOKE_MEDIUMS.join(', ')}, got "${name}"`,
      );
    }
    return medium;
  });
  return mediums;
}

function readCap(argv: string[]): number {
  const raw = readFlag(argv, 'max-credits');
  if (raw === undefined || raw.trim() === '') {
    throw new UsageError(
      '--max-credits is required: every smoke run needs a spend cap in credits (1 credit = $0.01); it refuses to run uncapped',
    );
  }
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) {
    throw new UsageError(
      `--max-credits must be a positive number, got "${raw}"`,
    );
  }
  return cap;
}

function runEval(args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', ['run', 'eval:content', '--', ...args], {
      cwd: readRepoRoot(),
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function runCell(
  cell: SmokeCell,
  options: { dispatcher: 'stub' | 'live'; outDir: string },
): Promise<SmokeCellResult> {
  const missing = cell.requiresEnv.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return {
      cell,
      detail: `needs ${missing.join(', ')}`,
      report: null,
      status: 'skipped',
    };
  }

  const out = join(options.outDir, `${cell.id}.json`);
  const exitCode = await runEval([
    ...cell.args,
    `--dispatcher=${options.dispatcher}`,
    `--max-credits=${cell.maxCredits}`,
    `--out=${out}`,
  ]);
  let report: SmokeCellResult['report'] = null;
  try {
    report = contentEvalReportSchema.parse(
      JSON.parse(readFileSync(resolveRepoPath(out), 'utf8')),
    );
  } catch (error: unknown) {
    return {
      cell,
      detail: `no readable report (exit ${exitCode}): ${error instanceof Error ? error.message : String(error)}`,
      report: null,
      status: 'failed',
    };
  }

  if (report.aborted === 'spend') {
    return { cell, detail: report.abortMessage, report, status: 'aborted' };
  }
  if (exitCode !== 0 || !report.passed) {
    return {
      cell,
      detail: report.abortMessage ?? `exit ${exitCode}`,
      report,
      status: 'failed',
    };
  }
  return { cell, detail: null, report, status: 'passed' };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const maxCredits = readCap(argv);
  const dispatcher = readFlag(argv, 'dispatcher') ?? 'stub';
  if (dispatcher !== 'stub' && dispatcher !== 'live') {
    throw new UsageError(
      `--dispatcher must be stub or live, got "${dispatcher}"`,
    );
  }
  const outDir = resolveRepoPath(
    readFlag(argv, 'out-dir') ?? 'reports/content-eval-smoke',
  );
  mkdirSync(outDir, { recursive: true });

  const plan = buildSmokePlan({
    dispatcher,
    genfeedApiUrl: process.env.CONTENT_EVAL_GENFEED_API_URL,
    kelderBrandId: process.env.CONTENT_EVAL_KELDER_BRAND_ID,
    mediums: readMediums(argv),
    maxCredits,
  });

  const results: SmokeCellResult[] = [];
  for (const cell of plan.cells) {
    results.push(await runCell(cell, { dispatcher, outDir }));
  }

  const { markdown, verdict } = summariseSmoke(results, maxCredits);
  writeFileSync(join(outDir, 'summary.md'), markdown);
  writeFileSync(
    join(outDir, 'summary.json'),
    `${JSON.stringify(
      {
        cells: results.map((result) => ({
          detail: result.detail,
          id: result.cell.id,
          maxCredits: result.cell.maxCredits,
          spentCredits: result.report?.spend.spentCredits ?? 0,
          status: result.status,
        })),
        dispatcher,
        maxCredits,
        spentCredits: verdict.spentCredits,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  }

  const isSkipFatal =
    readBool(argv, 'require-all', false) &&
    results.some((result) => result.status === 'skipped');
  return verdict.isFailed || isSkipFatal ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = error instanceof UsageError ? 2 : 1;
  },
);
