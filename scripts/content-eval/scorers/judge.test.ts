import { describe, expect, it } from 'vitest';
import type { FixtureRow } from '../contracts';
import { fixtureRowSchema } from '../contracts';
import { createStubDispatcher } from '../dispatchers/stub';
import { SpendCapExceededError, SpendLedger } from '../spend';
import { createEvalJudge, resolvePointwiseRubric } from './judge';
import {
  BATTLE_RUBRIC,
  CONTENT_QUALITY_RUBRIC,
  renderTemplate,
  rubricDigest,
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
