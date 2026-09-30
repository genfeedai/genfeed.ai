import { validateLearningRows } from '@api/collections/content-learning/services/learning-dataset.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
const row = {
  sourceFingerprint: 'log-sha',
  accountGroup: 'pseudonym',
  decisionAt: '2026-09-01T00:00:00Z',
  measuredAt: '2026-09-03T00:00:00Z',
  features: [1, 0, 1, 0, 1, 0, 1, 0, 1],
  armId: 'baseline-v1',
  probabilities: {
    'baseline-v1': 1,
    'question-example-v1': 0,
    'proof-steps-v1': 0,
  },
  reward: 0.5,
  synthetic: true,
};
const cutoff = new Date('2026-09-30T00:00:00Z');
describe('strict owned numeric import', () => {
  it('preserves immutable synthetic status and observed complete logging probabilities', () =>
    expect(validateLearningRows([row], cutoff)[0]).toEqual(row));
  it('rejects raw prompts, URLs and arbitrary unknown fields', () => {
    for (const extra of [
      { prompt: 'private' },
      { url: 'https://private' },
      { topic: 'private' },
    ])
      expect(() =>
        validateLearningRows([{ ...row, ...extra }], cutoff),
      ).toThrow('Unknown dataset fields');
  });
  it('rejects missing probabilities, unnormalized distributions, wrong feature lengths and immature rows', () => {
    for (const invalid of [
      { ...row, probabilities: {} },
      {
        ...row,
        probabilities: {
          'baseline-v1': 1,
          'question-example-v1': 1,
          'proof-steps-v1': 0,
        },
      },
      { ...row, features: [1] },
      { ...row, measuredAt: '2026-10-01T00:00:00Z' },
    ])
      expect(() => validateLearningRows([invalid], cutoff)).toThrow();
  });
});
