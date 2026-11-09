import { describe, expect, it } from 'vitest';
import {
  INGREDIENT_GENERATION_ACTIVE_STATUSES,
  INGREDIENT_GENERATION_SETTLED_STATUSES,
  INGREDIENT_READY_STATUSES,
  INGREDIENT_STATE_MACHINE,
  INGREDIENT_UNUSABLE_STATUSES,
  IngredientStatus,
} from './ingredient.enum';

describe('INGREDIENT_STATE_MACHINE', () => {
  it.each([
    [
      IngredientStatus.DRAFT,
      [
        IngredientStatus.PROCESSING,
        IngredientStatus.UPLOADED,
        IngredientStatus.GENERATED,
        IngredientStatus.FAILED,
      ],
    ],
    [
      IngredientStatus.PROCESSING,
      [
        IngredientStatus.UPLOADED,
        IngredientStatus.GENERATED,
        IngredientStatus.FAILED,
      ],
    ],
    [
      IngredientStatus.UPLOADED,
      [
        IngredientStatus.VALIDATED,
        IngredientStatus.REJECTED,
        IngredientStatus.ARCHIVED,
      ],
    ],
    [
      IngredientStatus.GENERATED,
      [
        IngredientStatus.VALIDATED,
        IngredientStatus.REJECTED,
        IngredientStatus.ARCHIVED,
      ],
    ],
    [
      IngredientStatus.VALIDATED,
      [IngredientStatus.REJECTED, IngredientStatus.ARCHIVED],
    ],
    [
      IngredientStatus.FAILED,
      [IngredientStatus.PROCESSING, IngredientStatus.ARCHIVED],
    ],
    [IngredientStatus.ARCHIVED, []],
    [
      IngredientStatus.REJECTED,
      [IngredientStatus.VALIDATED, IngredientStatus.ARCHIVED],
    ],
  ])('%s moves to %j', (from, expected) => {
    expect(INGREDIENT_STATE_MACHINE.next(from)).toEqual(expected);
  });

  it.each([
    [
      IngredientStatus.GENERATED,
      [IngredientStatus.DRAFT, IngredientStatus.PROCESSING],
    ],
    [
      IngredientStatus.FAILED,
      [IngredientStatus.DRAFT, IngredientStatus.PROCESSING],
    ],
    [
      IngredientStatus.PROCESSING,
      [IngredientStatus.DRAFT, IngredientStatus.FAILED],
    ],
  ])('%s is reached from %j', (to, expected) => {
    expect(INGREDIENT_STATE_MACHINE.sourcesOf(to)).toEqual(expected);
  });

  it('never lets a cancelled generation become generated', () => {
    expect(
      INGREDIENT_STATE_MACHINE.can(
        IngredientStatus.FAILED,
        IngredientStatus.GENERATED,
      ),
    ).toBe(false);
  });
});

describe('ingredient status sets', () => {
  it.each([
    [
      'active',
      INGREDIENT_GENERATION_ACTIVE_STATUSES,
      [IngredientStatus.DRAFT, IngredientStatus.PROCESSING],
    ],
    [
      'ready',
      INGREDIENT_READY_STATUSES,
      [
        IngredientStatus.GENERATED,
        IngredientStatus.UPLOADED,
        IngredientStatus.VALIDATED,
      ],
    ],
    [
      'unusable',
      INGREDIENT_UNUSABLE_STATUSES,
      [
        IngredientStatus.FAILED,
        IngredientStatus.ARCHIVED,
        IngredientStatus.REJECTED,
      ],
    ],
    [
      'settled',
      INGREDIENT_GENERATION_SETTLED_STATUSES,
      [
        IngredientStatus.GENERATED,
        IngredientStatus.UPLOADED,
        IngredientStatus.VALIDATED,
        IngredientStatus.FAILED,
        IngredientStatus.ARCHIVED,
        IngredientStatus.REJECTED,
      ],
    ],
  ])('%s is %j', (_name, actual, expected) => {
    expect(actual).toEqual(expected);
  });
});
