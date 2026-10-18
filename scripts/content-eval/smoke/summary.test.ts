import { describe, expect, it } from 'vitest';
import type { ContentEvalReport } from '../contracts';
import { buildSmokePlan } from './plan';
import { summariseSmoke, tallyTextKinds } from './summary';

const [textCell, imageCell] = buildSmokePlan({
  dispatcher: 'live',
  mediums: ['text', 'image'],
  maxCredits: 100,
}).cells;

function textReport(): ContentEvalReport {
  const row = (
    contentKind: string,
    guidanceArm: 'raw' | 'brief',
    isAccepted: boolean,
    score: number,
  ) => ({
    contentKind,
    contestant: { guidanceArm },
    isAccepted,
    votes: [{ score }],
  });
  return {
    evidenceKind: 'live-dispatcher',
    outcome: {
      rows: [
        row('article', 'raw', false, 0.25),
        row('article', 'brief', true, 0.75),
        row('reply', 'raw', true, 0.5),
        row('reply', 'brief', true, 1),
      ],
    },
    spend: { spentCredits: 2.5 },
  } as unknown as ContentEvalReport;
}

describe('tallyTextKinds', () => {
  it('splits accepted rows and mean judge score by guidance arm', () => {
    const tallies = tallyTextKinds(textReport());
    expect(tallies.article.raw).toMatchObject({ accepted: 0, rows: 1 });
    expect(tallies.article.brief).toMatchObject({ accepted: 1, rows: 1 });
    expect(tallies.reply.brief.scoreSum).toBe(1);
  });
});

describe('summariseSmoke', () => {
  it('fails the run on a failed or cap-aborted cell, not on a skipped one', () => {
    const ok = summariseSmoke(
      [
        {
          cell: textCell,
          detail: null,
          report: textReport(),
          status: 'passed',
        },
        {
          cell: imageCell,
          detail: 'needs CONTENT_EVAL_GENFEED_API_KEY',
          report: null,
          status: 'skipped',
        },
      ],
      100,
    );
    expect(ok.verdict.isFailed).toBe(false);
    expect(ok.markdown).toContain('| image | skipped |');

    for (const status of ['failed', 'aborted'] as const) {
      expect(
        summariseSmoke(
          [{ cell: textCell, detail: null, report: textReport(), status }],
          100,
        ).verdict.isFailed,
      ).toBe(true);
    }
  });

  it('reports spend against the cap and flags the known gaps', () => {
    const { markdown, verdict } = summariseSmoke(
      [
        {
          cell: textCell,
          detail: null,
          report: textReport(),
          status: 'passed',
        },
      ],
      100,
    );
    expect(verdict.spentCredits).toBe(2.5);
    expect(markdown).toContain('Spend 2.50 of 100.00 credits');
    expect(markdown).toMatch(/\| newsletter \| brand-voice-summary \|/);
    expect(markdown).toMatch(/\| music \| none \|/);
  });
});
