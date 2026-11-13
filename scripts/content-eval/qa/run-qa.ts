/**
 * Offline QA capture check (no model call, no spend).
 *
 *   bun scripts/content-eval/qa/run-qa.ts                       # validate the cards
 *   bun scripts/content-eval/qa/run-qa.ts --captures=<file>     # score a run
 *   bun scripts/content-eval/qa/run-qa.ts --cards=<file> ...    # a private card file
 *
 * `--captures` is a JSON array of QA captures written by the QA runner. The
 * summary goes to stdout, or to `--out`. Exit: 0 clean, 1 a failed or
 * context-missing capture or a bad card, 2 usage.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { z } from 'zod';
import { readFlag, UsageError } from '../cli';
import {
  findCardProblems,
  loadQaCards,
  loadSmokeRows,
  resolveTextRow,
} from './cards';
import { type QaResult, qaCaptureSchema } from './contracts';
import { evaluateCapture } from './evaluate';
import { evaluateOnboardingCapture, loadOnboardingCards } from './onboarding';
import { renderQaSummary, summarizeQaResults } from './summary';

async function main(argv: string[]): Promise<number> {
  const cards = loadQaCards(readFlag(argv, 'cards'));
  const onboardingCards = loadOnboardingCards();
  const problems = await findCardProblems(cards);
  if (problems.length > 0) {
    process.stderr.write(`${problems.join('\n')}\n`);
    return 1;
  }

  const capturesPath = readFlag(argv, 'captures');
  if (capturesPath === undefined) {
    process.stdout.write(
      `${cards.length} QA cards are valid; ${onboardingCards.length} onboarding cards loaded.\n`,
    );
    return 0;
  }

  const captures = z
    .array(qaCaptureSchema)
    .parse(JSON.parse(readFileSync(capturesPath, 'utf8')));
  const smokeRows = loadSmokeRows();
  const results: QaResult[] = captures.map((capture) => {
    const onboardingCard = onboardingCards.find(
      (candidate) => candidate.id === capture.cardId,
    );
    if (onboardingCard)
      return evaluateOnboardingCapture(onboardingCard, capture);
    const card = cards.find((candidate) => candidate.id === capture.cardId);
    if (!card) throw new UsageError(`No card "${capture.cardId}"`);
    return evaluateCapture(
      card,
      capture,
      card.medium === 'text' ? resolveTextRow(card, smokeRows) : null,
    );
  });

  const summary = summarizeQaResults(results);
  const markdown = renderQaSummary(summary);
  const outPath = readFlag(argv, 'out');
  if (outPath) writeFileSync(outPath, `${markdown}\n`);
  else process.stdout.write(`${markdown}\n`);
  return summary.isFailed ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(error instanceof UsageError ? 2 : 1);
  },
);
