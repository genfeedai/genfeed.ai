import { readFileSync } from 'node:fs';
import { readFlag, UsageError } from '../cli';
import type { ContentEvalReport } from '../contracts';
import { contentEvalReportSchema } from '../contracts';
import { catalogueCostUsd, reservationCostUsd, usdToCredits } from '../spend';
import type { CalibrationQuote, QuoteModelLine } from './types';

export const DEFAULT_EVALUATIONS_PROMPT_ALLOWANCE = 3000;
export const EXPECTED_COMPLETION_TOKENS: ReadonlyArray<
  readonly [prefix: string, tokens: number]
> = [
  ['content-quality-scorer', 250],
  ['evaluations', 600],
  ['content-quality-v1', 300],
  ['autoevals-battle', 300],
];

export function expectedCompletionTokens(rubricVersion: string | null): number {
  return (
    EXPECTED_COMPLETION_TOKENS.find(([prefix]) =>
      rubricVersion?.startsWith(prefix),
    )?.[1] ?? 300
  );
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function quoteReport(
  report: ContentEvalReport,
  evaluationsPromptAllowance: number,
): CalibrationQuote {
  const byModel = new Map<string, QuoteModelLine>();
  let expectedUsd = 0;
  let capUsd = 0;
  for (const call of report.calls.filter((entry) => entry.kind === 'judge')) {
    const promptTokens =
      call.promptTokens +
      (call.rubricVersion === 'evaluations-stub'
        ? evaluationsPromptAllowance
        : 0);
    const expected = expectedCompletionTokens(call.rubricVersion);
    const maxTokens =
      'maxTokens' in call.settings &&
      typeof call.settings.maxTokens === 'number'
        ? call.settings.maxTokens
        : expected;
    const callExpectedUsd =
      catalogueCostUsd(call.model, promptTokens, expected) ??
      reservationCostUsd(call.model, promptTokens, expected);
    const callCapUsd = reservationCostUsd(call.model, promptTokens, maxTokens);
    const line = byModel.get(call.model) ?? {
      calls: 0,
      capUsd: 0,
      expectedUsd: 0,
      model: call.model,
      promptTokens: 0,
    };
    line.calls += 1;
    line.capUsd += callCapUsd;
    line.expectedUsd += callExpectedUsd;
    line.promptTokens += promptTokens;
    byModel.set(call.model, line);
    expectedUsd += callExpectedUsd;
    capUsd += callCapUsd;
  }
  const models = [...byModel.values()]
    .sort((left, right) =>
      left.model < right.model ? -1 : left.model > right.model ? 1 : 0,
    )
    .map((line) => ({
      ...line,
      capUsd: roundUsd(line.capUsd),
      expectedUsd: roundUsd(line.expectedUsd),
    }));
  const rowCount = report.fixture.rowCount;
  const roundedExpectedUsd = roundUsd(expectedUsd);
  const roundedCapUsd = roundUsd(capUsd);
  return {
    capUsd: roundedCapUsd,
    evaluationsPromptAllowance,
    expectedUsd: roundedExpectedUsd,
    models,
    perRowExpectedUsd:
      rowCount === 0 ? null : roundUsd(roundedExpectedUsd / rowCount),
    recommendedMaxCredits: Math.ceil(usdToCredits(roundedCapUsd)),
    reportRunId: report.runId,
    rowCount,
  };
}

if (import.meta.main) {
  try {
    const argv = process.argv.slice(2);
    const path = readFlag(argv, 'report');
    if (path === undefined || path === '') {
      throw new UsageError(
        '--report is required: path to a stub content-eval report JSON',
      );
    }
    const rawAllowance =
      readFlag(argv, 'evaluations-prompt-allowance') ??
      String(DEFAULT_EVALUATIONS_PROMPT_ALLOWANCE);
    if (!/^\d+$/.test(rawAllowance)) {
      throw new UsageError(
        `--evaluations-prompt-allowance must be a non-negative integer, got "${rawAllowance}"`,
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new UsageError(
        `--report=${path} is not a readable JSON file: ${message}`,
      );
    }
    const parsed = contentEvalReportSchema.safeParse(value);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      throw new UsageError(
        `--report=${path} is not a content-eval report: ${issues}`,
      );
    }
    const quote = quoteReport(parsed.data, Number(rawAllowance));
    process.stdout.write(`${JSON.stringify(quote, null, 2)}\n`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Calibration quote failed: ${message}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
