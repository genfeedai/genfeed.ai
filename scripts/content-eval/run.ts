/**
 * Content-eval CLI (#4922).
 *
 * Usage (from the repo root; paths are repo-root-relative):
 *   bun run eval:content -- --suite=ladder \
 *     --fixture=apps/server/api/test/fixtures/content-evals/ladder/social-post.synthetic.jsonl \
 *     --models=google/gemini-2.5-flash-lite,deepseek/deepseek-v4-flash-0731 \
 *     --judge=anthropic/claude-sonnet-5 --max-credits=5 --out=reports/ladder.json
 *
 * Flags:
 *   --suite=judge|ladder|harness-ab   required (media-ladder is reserved, #4926)
 *   --fixture=<path>                  required, JSONL fixture
 *   --max-credits=<n>                 required spend cap (1 credit = $0.01)
 *   --judge=<key[,key]>               required judge registry key(s)
 *   --models=<key,...>                ladder: baseline first; harness-ab: one key
 *   --dispatcher=stub|live            default stub; live boots LlmDispatcherModule
 *                                     and needs the API environment
 *   --seed=<n>                        default 1, recorded on every call
 *   --tie-band=<0..1>                 pointwise tie band (default in contracts.ts)
 *   --out=<report.json>               write the report here instead of stdout
 *   --outlier-thresholds=<path.json>  outlier cut (#5234); defaults in
 *                                     outliers/contracts.ts, recorded per run
 *
 * Exit codes: 0 pass · 1 threshold failure, spend abort or run error · 2 usage.
 *
 * The npm script runs from `apps/server`, the directory the API's
 * ConfigService reads `api/.env*` from and whose tsconfig turns on the legacy
 * decorators Nest needs; Bun resolves each file's path aliases from its
 * nearest tsconfig, so this directory's own tsconfig covers the harness.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { REPORT_ANALYZERS } from './analyzers';
import { parseCliArgs, readFlag, UsageError } from './cli';
import type { DispatcherKind, EvalDispatcher } from './contracts';
import { createStubDispatcher } from './dispatchers/stub';
import { outlierThresholdsSchema } from './outliers';
import { resolveRepoPath } from './provenance';
import { renderSummary, writeReport } from './report';
import { runContentEval } from './runner';

async function createDispatcher(kind: DispatcherKind): Promise<EvalDispatcher> {
  if (kind === 'stub') {
    return createStubDispatcher();
  }

  const { createLiveDispatcher } = await import('./dispatchers/live');
  return createLiveDispatcher();
}

/** Read and validated before the run starts, so a bad file is a usage error. */
function readOutlierThresholds(argv: string[]): unknown {
  const path = readFlag(argv, 'outlier-thresholds');
  if (path === undefined) {
    return undefined;
  }
  if (path.trim() === '') {
    throw new UsageError('--outlier-thresholds needs a path to a JSON file');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolveRepoPath(path), 'utf8'));
  } catch (error: unknown) {
    throw new UsageError(
      `--outlier-thresholds=${path} is not a readable JSON file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const parsed = outlierThresholdsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UsageError(
      `--outlier-thresholds=${path} is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  return parsed.data;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const { out, ...args } = parseCliArgs(argv);
  const { exitCode, report } = await runContentEval({
    ...args,
    argv,
    createDispatcher,
    outlierThresholds: readOutlierThresholds(argv),
  });

  if (out) {
    writeReport(resolveRepoPath(out), report);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  process.stderr.write(renderSummary(report, REPORT_ANALYZERS));
  if (out) {
    process.stderr.write(`  report:    ${out}\n`);
  }

  return exitCode;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `Content eval failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
