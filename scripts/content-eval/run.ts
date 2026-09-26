/**
 * Content-eval CLI (#4922).
 *
 * Usage (from the repo root):
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
 *
 * Exit codes: 0 pass · 1 threshold failure, spend abort or run error · 2 usage.
 * The npm script passes `--tsconfig-override` so Bun applies the path aliases.
 */

import process from 'node:process';
import { REPORT_ANALYZERS } from './analyzers';
import { parseCliArgs, UsageError } from './cli';
import type { DispatcherKind, EvalDispatcher } from './contracts';
import { createStubDispatcher } from './dispatchers/stub';
import { renderSummary, writeReport } from './report';
import { runContentEval } from './runner';

async function createDispatcher(kind: DispatcherKind): Promise<EvalDispatcher> {
  if (kind === 'stub') {
    return createStubDispatcher();
  }

  const { createLiveDispatcher } = await import('./dispatchers/live');
  return createLiveDispatcher();
}

async function main(): Promise<number> {
  const { out, ...args } = parseCliArgs(process.argv.slice(2));
  const { exitCode, report } = await runContentEval({
    ...args,
    createDispatcher,
  });

  if (out) {
    writeReport(out, report);
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
