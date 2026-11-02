import { describe, expect, it } from 'vitest';
import {
  clampPage,
  filterWorkflowRows,
  getPageCount,
  sortWorkflowRows,
} from './workflow-rows';
import type { AdminWorkflowRow } from './workflow-rows.types';

function row(overrides: Partial<AdminWorkflowRow>): AdminWorkflowRow {
  return {
    id: overrides.label ?? 'row',
    label: 'Row',
    type: 'organization',
    ...overrides,
  };
}

const OLD = row({ createdAt: '2026-08-01T00:00:00.000Z', label: 'Old' });
const NEW = row({ createdAt: '2026-09-01T00:00:00.000Z', label: 'New' });
const TEMPLATE = row({ label: 'Template', type: 'system' });

function labels(rows: AdminWorkflowRow[]): string[] {
  return rows.map((item) => item.label);
}

describe('sortWorkflowRows', () => {
  it('puts system workflows first, then newest first, when no sort is chosen', () => {
    expect(
      labels(sortWorkflowRows([OLD, NEW, TEMPLATE], undefined, 'asc')),
    ).toEqual(['Template', 'New', 'Old']);
  });

  it.each([
    ['asc', ['Old', 'New', 'Template']],
    ['desc', ['New', 'Old', 'Template']],
  ] as const)(
    'keeps undated templates last when sorting createdAt %s',
    (direction, expected) => {
      expect(
        labels(sortWorkflowRows([TEMPLATE, NEW, OLD], 'createdAt', direction)),
      ).toEqual(expected);
    },
  );

  it.each([
    ['asc', ['New', 'Old', 'Template']],
    ['desc', ['Template', 'Old', 'New']],
  ] as const)('sorts by label %s', (direction, expected) => {
    expect(
      labels(sortWorkflowRows([OLD, TEMPLATE, NEW], 'label', direction)),
    ).toEqual(expected);
  });
});

describe('filterWorkflowRows', () => {
  it.each([
    ['all', ['Old', 'Template']],
    ['system', ['Template']],
    ['organization', ['Old']],
  ] as const)('filters by type %s', (type, expected) => {
    expect(labels(filterWorkflowRows([OLD, TEMPLATE], type, ''))).toEqual(
      expected,
    );
  });
});

describe('pagination helpers', () => {
  it.each([
    [0, 15, 1],
    [15, 15, 1],
    [16, 15, 2],
    [45, 15, 3],
  ])('%i rows at %i per page is %i pages', (total, size, pages) => {
    expect(getPageCount(total, size)).toBe(pages);
  });

  it.each([
    [0, 3, 1],
    [2, 3, 2],
    [9, 3, 3],
  ])('clamps page %i of 3 to %i', (page, count, expected) => {
    expect(clampPage(page, count)).toBe(expected);
  });
});
