import { parseLearningPolicy } from '@api/collections/content-learning/services/learning-policy.service';
import { initializeLearningPolicy } from '@genfeedai/harness';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
describe('strict registered policy dimensions', () => {
  it('rejects finite but non-nine-dimensional state', () => {
    const state = initializeLearningPolicy();
    state['baseline-v1'] = { a: [[1]], b: [0] };
    expect(parseLearningPolicy(state)).toBeNull();
  });
});
