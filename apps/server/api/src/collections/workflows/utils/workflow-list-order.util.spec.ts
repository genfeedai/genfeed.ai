import { buildWorkflowListOrderBy } from '@api/collections/workflows/utils/workflow-list-order.util';
import { describe, expect, it } from 'vitest';

describe('buildWorkflowListOrderBy', () => {
  it.each([
    ['label: 1', { createdAt: -1, id: -1, label: 1 }],
    ['status: -1', { createdAt: -1, id: -1, status: -1 }],
    ['trigger: 1', { createdAt: -1, id: -1, trigger: 1 }],
    ['updatedAt: -1', { createdAt: -1, id: -1, updatedAt: -1 }],
    ['createdAt: 1', { createdAt: 1, id: -1 }],
    ['createdAt: -1', { createdAt: -1, id: -1 }],
    ['label: 1, config: -1', { createdAt: -1, id: -1, label: 1 }],
  ])('orders by %j then by createdAt and id', (sort, expected) => {
    expect(buildWorkflowListOrderBy(sort)).toEqual(expected);
  });

  it.each([undefined, ''])('defaults to newest first for %j', (sort) => {
    expect(buildWorkflowListOrderBy(sort)).toEqual({ createdAt: -1, id: -1 });
  });

  it.each(['config: 1', 'userId: -1'])(
    'falls back to newest first for the unsortable %j',
    (sort) => {
      expect(buildWorkflowListOrderBy(sort)).toEqual({ createdAt: -1 });
    },
  );
});
