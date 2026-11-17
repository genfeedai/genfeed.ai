import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type { BrandCharacterListItem } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { canBrandManageCharacter } from './character-brand-context';

const base: BrandCharacterListItem = {
  id: 'p1',
  label: 'Anna',
  referenceIngredientIds: [],
};

describe('canBrandManageCharacter', () => {
  it.each([
    [
      'a character the brand owns',
      { owningBrandId: 'brand_a' },
      'brand_a',
      true,
    ],
    [
      'a character owned by another brand',
      { owningBrandId: 'brand_b' },
      'brand_a',
      false,
    ],
    ['an unbranded character', { owningBrandId: null }, 'brand_a', false],
    [
      'a character open to all brands',
      {
        availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
        owningBrandId: 'brand_b',
      },
      'brand_a',
      true,
    ],
    [
      'a character shared to the brand',
      {
        availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
        availableBrandIds: ['brand_a'],
        owningBrandId: 'brand_b',
      },
      'brand_a',
      true,
    ],
    [
      'a character shared to other brands only',
      {
        availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
        availableBrandIds: ['brand_c'],
        owningBrandId: 'brand_b',
      },
      'brand_a',
      false,
    ],
    [
      'a granted character',
      { isGranted: true, owningBrandId: 'brand_a' },
      'brand_a',
      false,
    ],
    ['no selected brand', { owningBrandId: 'brand_a' }, null, false],
  ] satisfies [
    string,
    Partial<BrandCharacterListItem>,
    string | null,
    boolean,
  ][])('is decided for %s', (_name, patch, brandId, expected) => {
    expect(canBrandManageCharacter({ ...base, ...patch }, brandId)).toBe(
      expected,
    );
  });
});
