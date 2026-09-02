import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

import {
  getIsChronologicalDescending,
  groupIngredientsByTime,
} from './ingredient-time-groups.util';

const DAY_MS = 24 * 60 * 60 * 1000;

function createIngredient(id: string, createdAt: Date): IIngredient {
  return { createdAt, id } as IIngredient;
}

describe('groupIngredientsByTime', () => {
  it('buckets a newest-first list into Today and Yesterday', () => {
    const now = new Date();
    const groups = groupIngredientsByTime([
      createIngredient('a', now),
      createIngredient('b', new Date(now.getTime() - DAY_MS)),
    ]);

    expect(groups?.map((group) => group.label)).toEqual(['Today', 'Yesterday']);
    expect(groups?.[0].items).toHaveLength(1);
  });

  it('keeps same-bucket assets together in one group', () => {
    const now = new Date();
    const groups = groupIngredientsByTime([
      createIngredient('a', now),
      createIngredient('b', new Date(now.getTime() - 60_000)),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups?.[0].items).toHaveLength(2);
  });

  it('labels older assets by month and year', () => {
    const groups = groupIngredientsByTime([
      createIngredient('a', new Date('2024-03-14T10:00:00.000Z')),
    ]);

    expect(groups?.[0].label).toBe('March 2024');
  });

  it('suppresses grouping when the list is not sorted newest-first', () => {
    const now = new Date();

    expect(
      groupIngredientsByTime([
        createIngredient('a', new Date(now.getTime() - DAY_MS)),
        createIngredient('b', now),
      ]),
    ).toBeNull();
  });

  it('suppresses grouping when an asset has no creation timestamp', () => {
    expect(getIsChronologicalDescending([{ id: 'a' } as IIngredient])).toBe(
      false,
    );
  });

  it('treats an empty list as chronological', () => {
    expect(groupIngredientsByTime([])).toEqual([]);
  });
});
