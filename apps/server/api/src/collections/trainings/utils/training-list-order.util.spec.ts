import { buildTrainingOrderBy } from '@api/collections/trainings/utils/training-list-order.util';
import { describe, expect, it } from 'vitest';

describe('buildTrainingOrderBy', () => {
  it.each([
    [undefined, { createdAt: -1 }],
    ['', { createdAt: -1 }],
    ['steps: 1', { createdAt: -1 }],
    ['password: -1', { createdAt: -1 }],
    ['label: 1', { createdAt: -1, id: -1, label: 1 }],
    ['status: 1', { createdAt: -1, id: -1, stage: 1 }],
    ['status: -1', { createdAt: -1, id: -1, stage: -1 }],
    ['createdAt: 1', { createdAt: 1, id: -1 }],
  ])('orders %j by %j', (sort, expected) => {
    expect(buildTrainingOrderBy(sort)).toEqual(expected);
  });
});
