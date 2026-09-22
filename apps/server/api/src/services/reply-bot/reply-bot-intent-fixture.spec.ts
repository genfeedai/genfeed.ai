import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyReplyIntent } from '@api/services/reply-bot/reply-intent.util';
import { hasCommentLinks } from '@api/services/reply-bot/reply-intent-classifier.service';
import type { ReplyIntent } from '@genfeedai/contracts/interfaces';
import { REPLY_INTENT_VALUES } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

/**
 * Guards the labelled set `scripts/typed-decisions/benchmark.ts` runs for
 * `reply_bot.intent`, and pins the incumbent regex's score on it (#4866).
 *
 * The set is constructed, not sampled from production — nobody outside the
 * deployment has that data — so these numbers describe the fixture, not live
 * traffic. What they do buy: a fixture the regex already aced would say
 * nothing about a replacement, and the spam false-positive rate the epic
 * gates `live` on has a number to be compared against.
 */

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../test/fixtures/typed-decisions/reply-bot-intent.jsonl',
);

interface FixtureRow {
  expected: ReplyIntent;
  options: string[];
  question: string;
  source: string;
  state: {
    authorHandle: string;
    comment: string;
    hasLinks: boolean;
    postCaption: string;
  };
}

const rows: FixtureRow[] = readFileSync(FIXTURE_PATH, 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as FixtureRow);

const regexAnswers = rows.map((row) => classifyReplyIntent(row.state.comment));

describe('reply-bot-intent labelled set', () => {
  it('carries at least the 300 rows the issue asks for', () => {
    expect(rows.length).toBeGreaterThanOrEqual(300);
  });

  it('covers every intent with a meaningful number of rows', () => {
    for (const intent of REPLY_INTENT_VALUES) {
      expect(
        rows.filter((row) => row.expected === intent).length,
      ).toBeGreaterThanOrEqual(50);
    }
  });

  it('labels every row with a real intent and no duplicate comments', () => {
    for (const row of rows) {
      expect(REPLY_INTENT_VALUES).toContain(row.expected);
      expect(row.options).toEqual([...REPLY_INTENT_VALUES]);
      expect(row.source).toMatch(/^synthetic\//);
    }

    expect(new Set(rows.map((row) => row.state.comment)).size).toBe(
      rows.length,
    );
  });

  it('sends exactly the state the classifier builds', () => {
    for (const row of rows) {
      expect(Object.keys(row.state).sort()).toEqual([
        'authorHandle',
        'comment',
        'hasLinks',
        'postCaption',
      ]);
      expect(row.state.hasLinks).toBe(hasCommentLinks(row.state.comment));
    }
  });

  it('pins what the incumbent regex scores, so fixture drift fails loudly', () => {
    const correct = regexAnswers.filter(
      (answer, index) => answer === rows[index]?.expected,
    ).length;

    // 234 / 359 = 65.2%. Exact on purpose: a fixture edit that moves the
    // baseline has to move this number with it, in the same review.
    expect(rows.length).toBe(359);
    expect(correct).toBe(234);
    // And real headroom to measure a replacement against.
    expect(correct / rows.length).toBeLessThan(0.8);
  });

  it('pins the regex spam false-positive rate the epic gates live on', () => {
    const nonSpam = rows.filter((row) => row.expected !== 'spam');
    const falsePositives = nonSpam.filter(
      (row) => regexAnswers[rows.indexOf(row)] === 'spam',
    ).length;

    // 1 / 294 = 0.34%: the bar a replacement has to clear.
    expect(nonSpam.length).toBe(294);
    expect(falsePositives).toBe(1);
  });
});
