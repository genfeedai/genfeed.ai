/**
 * Offline typed-decision benchmark (#4864).
 *
 * Runs a labelled JSONL fixture against the provider this deployment's config
 * would bind — the same `createTypedDecisionProvider` the NestJS module uses —
 * and prints accuracy, a confusion matrix, per-confidence-bin accuracy
 * (calibration) and p50/p95 latency. No decision point in epic #4863 goes live
 * on a number this script has not printed.
 *
 * Usage (from the repo root, with the API env in place):
 *   bun run bench:typed-decisions -- \
 *     --fixture=apps/server/api/test/fixtures/typed-decisions/reply-bot-intent.example.jsonl \
 *     --min-accuracy=0.8
 *
 * Fixture rows are JSONL: `{ state, expected, source }`, plus `question` and
 * (for a choice) `options` — on the row, or once on the command line with
 * `--question` / `--options`. The kind is read off `expected`: a string is a
 * choice, a number a score, a boolean a decision.
 *
 * Flags:
 *   --fixture=<path>        required, JSONL fixture
 *   --min-accuracy=<0..1>   exit non-zero below this accuracy
 *   --question=<text>       default question for rows that omit one
 *   --options=a,b,c         default choice options
 *   --score-tolerance=<n>   |answer - expected| that still counts (default 0.1)
 *   --timeout-ms=<n>        per-call budget (default TYPED_DECISION_TIMEOUT_MS)
 *
 * The npm script passes `--tsconfig-override` so Bun applies the repo's path
 * aliases to the API sources this file pulls in. Bun prints a cosmetic
 * "Internal error: directory mismatch" notice for that flag; ignore it.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { createTypedDecisionProvider } from '@api/services/typed-decisions/typed-decision-provider.factory';
import { TYPED_DECISION_DEFAULT_TIMEOUT_MS } from '@api/services/typed-decisions/typed-decisions.constants';
import type {
  TypedDecisionAnswer,
  TypedDecisionDeterministicAnswer,
  TypedDecisionProvider,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { createLogger, format, transports } from 'winston';
import {
  type BenchmarkOutcome,
  formatAccuracy,
  isCorrectAnswer,
  percentile,
  renderCalibration,
  renderConfusionMatrix,
} from './report';

const DEFAULT_SCORE_TOLERANCE = 0.1;

interface BenchmarkFixtureRow {
  expected: TypedDecisionDeterministicAnswer;
  options?: string[];
  question?: string;
  source: string;
  state: Record<string, unknown>;
}

interface BenchmarkDefaults {
  options: string[];
  question: string;
}

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function readNumberFlag(name: string): number | undefined {
  const raw = readFlag(name);
  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} must be a number, got "${raw}"`);
  }

  return parsed;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseRow(line: string, index: number): BenchmarkFixtureRow {
  const row = asRecord(JSON.parse(line));
  const state = asRecord(row?.state);
  const expected = row?.expected;

  if (!row || !state) {
    throw new Error(`Fixture row ${index + 1} has no object \`state\``);
  }
  if (
    typeof expected !== 'string' &&
    typeof expected !== 'number' &&
    typeof expected !== 'boolean'
  ) {
    throw new Error(
      `Fixture row ${index + 1} has no string/number/boolean \`expected\``,
    );
  }

  const options = row.options;
  const question = row.question;

  return {
    expected,
    ...(Array.isArray(options)
      ? { options: options.map((option) => String(option)) }
      : {}),
    ...(typeof question === 'string' ? { question } : {}),
    source: typeof row.source === 'string' ? row.source : 'unknown',
    state,
  };
}

function loadFixture(path: string): BenchmarkFixtureRow[] {
  const rows = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'))
    .map(parseRow);

  if (rows.length === 0) {
    throw new Error(`Fixture ${path} has no rows`);
  }

  return rows;
}

async function answerRow(
  provider: TypedDecisionProvider,
  row: BenchmarkFixtureRow,
  defaults: BenchmarkDefaults,
  timeoutMs: number,
): Promise<TypedDecisionAnswer<TypedDecisionDeterministicAnswer> | null> {
  const question = row.question ?? defaults.question;
  const options = row.options ?? defaults.options;
  const signal = AbortSignal.timeout(timeoutMs);

  if (typeof row.expected === 'boolean') {
    return provider.decide({ question, state: row.state }, { signal });
  }
  if (typeof row.expected === 'number') {
    return provider.score({ question, state: row.state }, { signal });
  }
  if (options.length === 0) {
    throw new Error(
      'A choice fixture needs --options=a,b,c or an `options` field per row',
    );
  }

  return provider.choose({ options, question, state: row.state }, { signal });
}

function buildLogger(): LoggerService {
  return new LoggerService(
    createLogger({
      format: format.simple(),
      level: 'warn',
      // Keep the report on stdout clean; provider warnings go to stderr.
      transports: [new transports.Console({ stderrLevels: ['error', 'warn'] })],
    }),
  );
}

function resolveTimeoutMs(configService: ConfigService): number {
  const flag = readNumberFlag('timeout-ms');
  if (flag !== undefined && flag > 0) {
    return flag;
  }

  const configured = Number(configService.get('TYPED_DECISION_TIMEOUT_MS'));

  return Number.isFinite(configured) && configured > 0
    ? configured
    : TYPED_DECISION_DEFAULT_TIMEOUT_MS;
}

async function main(): Promise<void> {
  const fixturePath = readFlag('fixture');
  if (!fixturePath) {
    throw new Error('--fixture=<path to a labelled JSONL file> is required');
  }

  const configService = new ConfigService();
  const provider = createTypedDecisionProvider(configService, buildLogger());
  const rows = loadFixture(fixturePath);
  const timeoutMs = resolveTimeoutMs(configService);
  const scoreTolerance =
    readNumberFlag('score-tolerance') ?? DEFAULT_SCORE_TOLERANCE;
  const defaults: BenchmarkDefaults = {
    options: (readFlag('options') ?? '')
      .split(',')
      .map((option) => option.trim())
      .filter(Boolean),
    question: readFlag('question') ?? 'Which label fits this state?',
  };

  const outcomes: BenchmarkOutcome[] = [];
  for (const row of rows) {
    const startedAt = Date.now();
    // Sequential on purpose: a benchmark that batches measures the vendor's
    // concurrency, not the latency a request path would see.
    const answer = await answerRow(provider, row, defaults, timeoutMs);
    outcomes.push({
      expected: row.expected,
      isCorrect:
        answer !== null &&
        isCorrectAnswer(row.expected, answer.value, scoreTolerance),
      latencyMs: Date.now() - startedAt,
      ...(answer === null
        ? {}
        : { confidence: answer.confidence, predicted: answer.value }),
    });
  }

  const answered = outcomes.filter(
    (outcome) => outcome.predicted !== undefined,
  );
  const correct = answered.filter((outcome) => outcome.isCorrect).length;
  const accuracy = answered.length === 0 ? 0 : correct / answered.length;
  const latencies = outcomes.map((outcome) => outcome.latencyMs);

  let report = '\nTyped decision benchmark\n';
  report += `  fixture:   ${fixturePath}\n`;
  report += `  provider:  ${provider.name}\n`;
  report += `  timeout:   ${timeoutMs}ms\n`;
  report += `  rows:      ${rows.length}\n`;
  report += `  answered:  ${formatAccuracy(answered.length, rows.length)}\n`;
  report += `  accuracy:  ${formatAccuracy(correct, answered.length)}\n`;
  report += `  latency:   p50 ${percentile(latencies, 0.5)}ms · p95 ${percentile(latencies, 0.95)}ms\n`;
  report += `\nConfusion matrix\n${renderConfusionMatrix(outcomes)}`;
  report += `\nCalibration (accuracy by confidence bin)\n${renderCalibration(outcomes)}`;

  const minAccuracy = readNumberFlag('min-accuracy');
  if (minAccuracy !== undefined) {
    const isPassing = answered.length > 0 && accuracy >= minAccuracy;
    report += `\nBaseline ${minAccuracy}: ${isPassing ? 'PASS' : 'FAIL'}\n`;
    if (!isPassing) {
      process.exitCode = 1;
    }
  }

  if (answered.length === 0) {
    report += `\nNo answers: the bound provider is "${provider.name}". Set TYPED_DECISION_PROVIDER=jev with a TYPESAFE_API_KEY to benchmark a real provider.\n`;
  }

  process.stdout.write(report);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Typed decision benchmark failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
