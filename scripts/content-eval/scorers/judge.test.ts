import { describe, expect, it } from 'vitest';
import type { FixtureRow } from '../contracts';
import { fixtureRowSchema } from '../contracts';
import { createStubDispatcher } from '../dispatchers/stub';
import { SpendCapExceededError, SpendLedger } from '../spend';
import {
  createEvalJudge,
  resolvePointwiseRubric,
  scoreClaimVerdicts,
} from './judge';
import {
  assertRubricMayGate,
  BATTLE_RUBRIC,
  CONTENT_CLAIMS_RUBRIC,
  CONTENT_QUALITY_RUBRIC,
  renderTemplate,
  rubricDigest,
  toRubricRecord,
} from './rubrics';

const JUDGE = 'anthropic/claude-sonnet-5';

const ROW: FixtureRow = fixtureRowSchema.parse({
  brandFixtureId: 'synthetic-kelder',
  contentKind: 'social-post',
  id: 'row-1',
  input: { brief: { guidance: 'Calm voice.' }, prompt: 'Announce a skillet.' },
  rubricVersion: CONTENT_QUALITY_RUBRIC.version,
  source: { reference: 'synthetic:kelder', visibility: 'synthetic' },
});

describe('rubrics', () => {
  it('uses the autoevals battle template verbatim', () => {
    expect(BATTLE_RUBRIC.promptTemplate).toContain('[Response 1]');
    expect(BATTLE_RUBRIC.choiceScores).toEqual({ No: 0, Yes: 1 });
  });

  it('hashes rubric text so a wording change changes the digest', () => {
    expect(rubricDigest(CONTENT_QUALITY_RUBRIC)).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(
      rubricDigest({ ...CONTENT_QUALITY_RUBRIC, promptTemplate: 'edited' }),
    ).not.toBe(rubricDigest(CONTENT_QUALITY_RUBRIC));
  });

  it('renders variables and refuses unknown ones or sections', () => {
    expect(renderTemplate('A {{x}} B {{ y }}', { x: 'one', y: { z: 1 } })).toBe(
      'A one B {"z":1}',
    );
    expect(() => renderTemplate('{{missing}}', {})).toThrow('has no value');
    expect(() => renderTemplate('{{#list}}', { '#list': [] })).toThrow(
      'not supported',
    );
  });

  it('rejects an unknown pointwise rubric and the battle rubric', () => {
    expect(() => resolvePointwiseRubric('content-quality-v9')).toThrow(
      'Unknown pointwise rubric',
    );
    expect(() => resolvePointwiseRubric(BATTLE_RUBRIC.version)).toThrow();
  });
});

describe('createEvalJudge', () => {
  it('scores pointwise through the dispatcher and records provenance', async () => {
    const ledger = new SpendLedger(10);
    const judge = createEvalJudge({
      dispatcher: createStubDispatcher(),
      ledger,
      seed: 1,
    });

    const judgement = await judge.pointwise({
      judgeRegistryKey: JUDGE,
      output: 'Our skillet is here. Shop now.',
      row: ROW,
    });

    expect(Object.values(CONTENT_QUALITY_RUBRIC.choiceScores)).toContain(
      judgement.score,
    );
    expect(judgement.vote).toMatchObject({
      family: 'anthropic',
      judgeRegistryKey: JUDGE,
      provider: 'stub',
    });
    expect(ledger.calls[0]).toMatchObject({
      kind: 'judge',
      rubricDigest: rubricDigest(CONTENT_QUALITY_RUBRIC),
      rubricVersion: 'content-quality-v1',
    });
    expect(judge.rubrics().map((rubric) => rubric.version)).toEqual([
      'content-quality-v1',
    ]);
  });

  it('gives an order-consistent battle verdict with the stub', async () => {
    const judge = createEvalJudge({
      dispatcher: createStubDispatcher(),
      ledger: new SpendLedger(10),
      seed: 1,
    });
    const forward = await judge.battle({
      first: 'Answer one.',
      judgeRegistryKey: JUDGE,
      row: ROW,
      second: 'Answer two.',
    });
    const swapped = await judge.battle({
      first: 'Answer two.',
      judgeRegistryKey: JUDGE,
      row: ROW,
      second: 'Answer one.',
    });

    expect(forward.isFirstPreferred).toBe(!swapped.isFirstPreferred);
  });

  it('turns a provider failure into a null vote but lets the spend cap through', async () => {
    const failing = createEvalJudge({
      dispatcher: createStubDispatcher({ failingModels: [JUDGE] }),
      ledger: new SpendLedger(10),
      seed: 1,
    });
    const judgement = await failing.pointwise({
      judgeRegistryKey: JUDGE,
      output: 'Text.',
      row: ROW,
    });
    expect(judgement.score).toBeNull();
    expect(judgement.failure).toContain('Stub failure');

    const capped = createEvalJudge({
      dispatcher: createStubDispatcher({ usdPerToken: 1 }),
      ledger: new SpendLedger(0.01),
      seed: 1,
    });
    await expect(
      capped.pointwise({ judgeRegistryKey: JUDGE, output: 'Text.', row: ROW }),
    ).rejects.toThrow(SpendCapExceededError);
  });
});

describe('claim rubric (#5604)', () => {
  const CLAIM_ROW: FixtureRow = { ...ROW, rubricVersion: 'content-claims-v1' };
  const verdicts = (
    entries: Array<[string, 'pass' | 'fail' | 'not-applicable']>,
  ) =>
    entries.map(([claimId, verdict]) => ({
      claimId,
      reasons: 'checked',
      verdict,
    }));
  const allClaims = (verdict: 'pass' | 'fail' | 'not-applicable') =>
    verdicts(
      (CONTENT_CLAIMS_RUBRIC.claims ?? []).map((claim) => [claim.id, verdict]),
    );

  it('is a new version and leaves content-quality-v1 and its digest unchanged', () => {
    expect(resolvePointwiseRubric('content-claims-v1')).toBe(
      CONTENT_CLAIMS_RUBRIC,
    );
    expect(rubricDigest(CONTENT_QUALITY_RUBRIC)).toBe(
      'sha256:f1a856ef401ba9380046961ec05e358772b7bbadbb7c52e27923ab4ff39b2443',
    );
    expect(toRubricRecord(CONTENT_QUALITY_RUBRIC)).not.toHaveProperty('claims');
    expect(toRubricRecord(CONTENT_CLAIMS_RUBRIC).claims).toHaveLength(8);
  });

  it('changes its digest when a claim is reworded', () => {
    const [first, ...rest] = CONTENT_CLAIMS_RUBRIC.claims ?? [];
    const edited = {
      ...CONTENT_CLAIMS_RUBRIC,
      claims: [{ ...first, text: `${first?.text} Reworded.` }, ...rest],
    };
    expect(rubricDigest(edited as typeof CONTENT_CLAIMS_RUBRIC)).not.toBe(
      rubricDigest(CONTENT_CLAIMS_RUBRIC),
    );
  });

  it('scores the share of applicable claims that pass', () => {
    const mixed = allClaims('not-applicable');
    mixed[0] = { ...mixed[0], verdict: 'pass' };
    mixed[1] = { ...mixed[1], verdict: 'pass' };
    mixed[2] = { ...mixed[2], verdict: 'pass' };
    mixed[3] = { ...mixed[3], verdict: 'fail' };
    expect(scoreClaimVerdicts(CONTENT_CLAIMS_RUBRIC, mixed)).toBe(0.75);
    expect(scoreClaimVerdicts(CONTENT_CLAIMS_RUBRIC, allClaims('pass'))).toBe(
      1,
    );
  });

  it('refuses verdicts that skip, repeat or cannot score a claim', () => {
    const all = allClaims('pass');
    expect(() =>
      scoreClaimVerdicts(CONTENT_CLAIMS_RUBRIC, all.slice(1)),
    ).toThrow('missing brief-ask');
    expect(() =>
      scoreClaimVerdicts(CONTENT_CLAIMS_RUBRIC, [...all, all[0]]),
    ).toThrow('each claim once');
    expect(() =>
      scoreClaimVerdicts(CONTENT_CLAIMS_RUBRIC, allClaims('not-applicable')),
    ).toThrow('no score');
  });

  it('judges every claim in one call and derives the score from the verdicts', async () => {
    const ledger = new SpendLedger(10);
    const judge = createEvalJudge({
      dispatcher: createStubDispatcher(),
      ledger,
      seed: 1,
    });

    const judgement = await judge.pointwise({
      judgeRegistryKey: JUDGE,
      output: 'Our skillet is here. Shop now.',
      row: CLAIM_ROW,
    });

    expect(judgement.failure).toBeNull();
    expect(judgement.claimVerdicts?.map((entry) => entry.claimId)).toEqual(
      CONTENT_CLAIMS_RUBRIC.claims?.map((claim) => claim.id),
    );
    expect(judgement.score).toBe(
      scoreClaimVerdicts(CONTENT_CLAIMS_RUBRIC, judgement.claimVerdicts ?? []),
    );
    expect(ledger.calls).toHaveLength(1);
    expect(ledger.calls[0]).toMatchObject({
      rubricDigest: rubricDigest(CONTENT_CLAIMS_RUBRIC),
      rubricVersion: 'content-claims-v1',
    });
  });

  it('cannot gate or optimize without a calibration report', () => {
    expect(() => assertRubricMayGate(CONTENT_CLAIMS_RUBRIC)).toThrow(
      'no calibration report',
    );
    expect(() =>
      assertRubricMayGate({
        ...CONTENT_CLAIMS_RUBRIC,
        calibrationReport:
          'scripts/content-eval/calibration/reports/claims.json',
      }),
    ).not.toThrow();
    expect(() => assertRubricMayGate(CONTENT_QUALITY_RUBRIC)).not.toThrow();
  });
});
