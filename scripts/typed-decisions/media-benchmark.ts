/**
 * Media-gate benchmark mode (#4883), reached through
 * `bun run bench:typed-decisions -- --mode=media`.
 *
 * Three sections, one per gate layer of epic #4877:
 * - readiness: every seeded `PLATFORM_MEDIA_SPECS` entry against compliant and
 *   just-past-the-limit probes. Deterministic; any miss fails the run.
 * - moderation: the labelled transcript set (and, with `--image-manifest`, an
 *   operator-held image manifest) through the configured moderation adapter,
 *   printing per-category precision/recall at the configured thresholds and
 *   accuracy per score decile.
 * - text decisions: the media-text fixtures through a typed-decision
 *   provider, per question, with the production question text.
 *
 * Flags (media mode):
 *   --moderation-fixture=<path>  default: the committed transcript set
 *   --image-manifest=<path>      JSONL `{ url, expected, source }`, never
 *                                committed (see the fixture README)
 *   --text-fixture=<path>        repeatable via commas; default: both
 *                                committed media-text sets
 *   --provider=<name>            typed-decision adapter (default jev)
 *   --skip=readiness,moderation,text
 *   --min-recall=<0..1>          fail when a measurable moderation category
 *                                recalls below this
 *   --min-accuracy=<0..1>        fail when a text question scores below this
 *
 * Moderation uses MODERATION_PROVIDER / MODERATION_THRESHOLDS from the
 * environment exactly as the API does; with the provider `none` the section
 * says so and prints nothing else.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { resolveModerationSettings } from '@api/services/moderation/moderation.settings';
import { computeModerationCalibration } from '@api/services/moderation/moderation-calibration.util';
import { createModerationProvider } from '@api/services/moderation/moderation-provider.factory';
import {
  buildReadinessSamples,
  scoreReadinessSamples,
} from '@api-test/fixtures/media-gates/readiness-samples.fixture';
import { ModerationCategory } from '@genfeedai/contracts';
import type { ModerationScores } from '@genfeedai/contracts/api-types/contracts';
import type {
  IModerationProvider,
  TypedDecisionProvider,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  binByScore,
  type MediaTextBenchmarkCase,
  type ModerationFixtureRow,
  parseMediaTextRow,
  parseModerationRow,
  renderModerationCategories,
  renderReadinessSummary,
  renderScoreBins,
  suggestThreshold,
} from './media-report';
import {
  type BenchmarkOutcome,
  formatAccuracy,
  percentile,
  renderConfusionMatrix,
} from './report';

const FIXTURE_DIR = 'apps/server/api/test/fixtures/media-gates';
const DEFAULT_MODERATION_FIXTURE = `${FIXTURE_DIR}/moderation-transcripts.jsonl`;
const DEFAULT_TEXT_FIXTURES = [
  `${FIXTURE_DIR}/media-text-transcripts.jsonl`,
  `${FIXTURE_DIR}/caption-description-pairs.jsonl`,
];

export interface MediaBenchmarkOptions {
  configService: ConfigService;
  decisionProvider: TypedDecisionProvider;
  logger: LoggerService;
  readFlag: (name: string) => string | undefined;
  readNumberFlag: (name: string) => number | undefined;
  timeoutMs: number;
}

/** Indent every non-empty line; a trailing newline gains no stray indent. */
function indent(text: string): string {
  return text.replace(/^(?=.)/gm, '    ');
}

function readLines(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));
}

function runReadiness(): { isPassing: boolean; report: string } {
  const results = scoreReadinessSamples(buildReadinessSamples());
  const correct = results.filter((result) => result.isCorrect).length;
  let report = '\nReadiness (seeded spec table)\n';
  report += `  samples:   ${formatAccuracy(correct, results.length)}\n`;
  report += renderReadinessSummary(results);
  return { isPassing: correct === results.length, report };
}

async function classify(
  provider: IModerationProvider,
  row: ModerationFixtureRow,
): Promise<ModerationScores> {
  return row.url !== undefined
    ? provider.classifyImage(row.url)
    : provider.classifyText(row.text ?? '');
}

async function runModeration(
  options: MediaBenchmarkOptions,
): Promise<{ isPassing: boolean; report: string }> {
  const settings = resolveModerationSettings(options.configService);
  const provider = createModerationProvider(
    options.configService,
    options.logger,
  );
  let report = '\nModeration\n';
  report += `  provider:  ${provider.name}\n`;
  if (!provider.isEnabled) {
    report +=
      '  skipped:   no moderation adapter bound. Set MODERATION_PROVIDER=openai with OPENAI_API_KEY to benchmark it.\n';
    return { isPassing: true, report };
  }

  const paths = [
    options.readFlag('moderation-fixture') ?? DEFAULT_MODERATION_FIXTURE,
    ...(options.readFlag('image-manifest') ?? '')
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean),
  ];
  const rows = paths.flatMap((path) => readLines(path).map(parseModerationRow));
  const samples: Array<{
    expected: ModerationCategory[];
    scores: ModerationScores;
  }> = [];
  const latencies: number[] = [];
  let failures = 0;
  for (const row of rows) {
    const startedAt = Date.now();
    try {
      // Sequential on purpose, as in the decision benchmark.
      const scores = await classify(provider, row);
      latencies.push(Date.now() - startedAt);
      // parseModerationRow rejected any label that is not a category.
      samples.push({
        expected: row.expected as ModerationCategory[],
        scores,
      });
    } catch (error: unknown) {
      failures += 1;
      options.logger.warn(
        `moderation call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const calibration = computeModerationCalibration(
    samples,
    settings.thresholds,
  );
  report += `  fixtures:  ${paths.join(', ')}\n`;
  report += `  rows:      ${rows.length} (${failures} failed)\n`;
  report += `  latency:   p50 ${percentile(latencies, 0.5)}ms · p95 ${percentile(latencies, 0.95)}ms\n`;
  report += `\n${renderModerationCategories(calibration, settings.thresholds)}`;
  report +=
    '\nCalibration (positive-label rate by score decile, per category)\n';
  for (const category of Object.values(ModerationCategory).sort()) {
    const bins = binByScore(
      samples.map((sample) => ({
        isPositive: sample.expected.includes(category),
        score: sample.scores[category] ?? 0,
      })),
    );
    report += `  ${category} (configured ${settings.thresholds[category].toFixed(2)})\n`;
    report += renderScoreBins(bins, suggestThreshold(bins));
  }

  const minRecall = options.readNumberFlag('min-recall');
  const measured = calibration.filter((row) => row.recall !== null);
  const isPassing =
    failures === 0 &&
    (minRecall === undefined ||
      measured.every((row) => (row.recall ?? 0) >= minRecall));
  if (minRecall !== undefined) {
    report += `\nRecall baseline ${minRecall}: ${isPassing ? 'PASS' : 'FAIL'}\n`;
  }
  return { isPassing, report };
}

async function answerCase(
  provider: TypedDecisionProvider,
  testCase: MediaTextBenchmarkCase,
  timeoutMs: number,
): Promise<BenchmarkOutcome> {
  const startedAt = Date.now();
  const answer = await provider
    .decide(
      { question: testCase.question, state: testCase.state },
      { signal: AbortSignal.timeout(timeoutMs) },
    )
    .catch(() => null);
  return {
    expected: testCase.expected,
    isCorrect: answer !== null && answer.value === testCase.expected,
    latencyMs: Date.now() - startedAt,
    ...(answer === null
      ? {}
      : { confidence: answer.confidence, predicted: answer.value }),
  };
}

async function runTextDecisions(
  options: MediaBenchmarkOptions,
): Promise<{ isPassing: boolean; report: string }> {
  const paths = (options.readFlag('text-fixture') ?? '')
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);
  const fixtures = paths.length > 0 ? paths : DEFAULT_TEXT_FIXTURES;
  const cases = fixtures.flatMap((path) =>
    readLines(path).flatMap(parseMediaTextRow),
  );
  const provider = options.decisionProvider;
  const byName = new Map<string, BenchmarkOutcome[]>();
  for (const testCase of cases) {
    const outcome = await answerCase(provider, testCase, options.timeoutMs);
    byName.set(testCase.name, [...(byName.get(testCase.name) ?? []), outcome]);
  }

  let report = '\nText decisions on perception output\n';
  report += `  provider:  ${provider.name}\n`;
  report += `  fixtures:  ${fixtures.join(', ')}\n`;
  const minAccuracy = options.readNumberFlag('min-accuracy');
  let isPassing = true;
  for (const [name, outcomes] of [...byName].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const answered = outcomes.filter(
      (outcome) => outcome.predicted !== undefined,
    );
    const correct = answered.filter((outcome) => outcome.isCorrect).length;
    const accuracy = answered.length === 0 ? 0 : correct / answered.length;
    // Accuracy over answered cases only would pass 1 right out of 150.
    if (
      minAccuracy !== undefined &&
      (accuracy < minAccuracy || answered.length < outcomes.length)
    ) {
      isPassing = false;
    }
    // Only a `false` answer acts (MEDIA_TEXT_GATE_MIN_CONFIDENCE), so only
    // `false` answers are calibrated: how often was the label also false?
    const falseBins = binByScore(
      answered
        .filter((outcome) => outcome.predicted === false)
        .map((outcome) => ({
          isPositive: outcome.expected === false,
          score: outcome.confidence ?? 0,
        })),
    );
    report += `\n  ${name}\n`;
    report += `    answered:  ${formatAccuracy(answered.length, outcomes.length)}\n`;
    report += `    accuracy:  ${formatAccuracy(correct, answered.length)}\n`;
    report += `    latency:   p50 ${percentile(
      outcomes.map((outcome) => outcome.latencyMs),
      0.5,
    )}ms\n`;
    report += `    confusion:\n${indent(renderConfusionMatrix(outcomes))}`;
    report += `    \`false\` answers by confidence decile (label also false):\n${renderScoreBins(falseBins, suggestThreshold(falseBins))}`;
  }
  if (
    cases.length > 0 &&
    [...byName.values()]
      .flat()
      .every((outcome) => outcome.predicted === undefined)
  ) {
    report += `\n  No answers: the bound provider is "${provider.name}". Pass --provider=jev with a TYPESAFE_API_KEY in the environment to benchmark a real provider.\n`;
  }
  if (minAccuracy !== undefined) {
    report += `\nAccuracy baseline ${minAccuracy}: ${isPassing ? 'PASS' : 'FAIL'}\n`;
  }
  return { isPassing, report };
}

export async function runMediaBenchmark(
  options: MediaBenchmarkOptions,
): Promise<void> {
  const skipped = new Set(
    (options.readFlag('skip') ?? '')
      .split(',')
      .map((section) => section.trim())
      .filter(Boolean),
  );
  const sections: Array<{ isPassing: boolean; report: string }> = [];
  if (!skipped.has('readiness')) {
    sections.push(runReadiness());
  }
  if (!skipped.has('moderation')) {
    sections.push(await runModeration(options));
  }
  if (!skipped.has('text')) {
    sections.push(await runTextDecisions(options));
  }

  const isPassing = sections.every((section) => section.isPassing);
  process.stdout.write(
    `\nMedia gate benchmark\n${sections.map((section) => section.report).join('')}\nResult: ${isPassing ? 'PASS' : 'FAIL'}\n`,
  );
  if (!isPassing) {
    process.exitCode = 1;
  }
}
