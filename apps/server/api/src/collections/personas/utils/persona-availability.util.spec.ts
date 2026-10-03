import {
  brandAvailabilityWhere,
  hasSharedAvailability,
  isPersonaAvailableToBrand,
  isPersonaSharedAcrossBrands,
  resolvePersonaBrandIds,
} from '@api/collections/personas/utils/persona-availability.util';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';

describe('persona availability util', () => {
  const owned = {
    availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
    availableBrandIds: [],
    brandId: 'a',
  };
  const all = {
    ...owned,
    availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
  };
  const selected = {
    ...owned,
    availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
    availableBrandIds: ['a', 'b'],
  };

  it('keeps owning-brand-only characters private to the owning brand', () => {
    expect(isPersonaAvailableToBrand(owned, 'a')).toBe(true);
    expect(isPersonaAvailableToBrand(owned, 'b')).toBe(false);
    expect(isPersonaAvailableToBrand(owned, null)).toBe(false);
  });

  it('offers all-brands characters to every brand', () => {
    expect(isPersonaAvailableToBrand(all, 'zzz')).toBe(true);
  });

  it('offers selected-brands characters only to listed brands', () => {
    expect(isPersonaAvailableToBrand(selected, 'b')).toBe(true);
    expect(isPersonaAvailableToBrand(selected, 'c')).toBe(false);
  });

  it('treats org-level characters without a brand as not available to any brand', () => {
    expect(isPersonaAvailableToBrand({ ...owned, brandId: null }, 'a')).toBe(
      false,
    );
  });

  it('flags shared only when more than the owning brand can use it', () => {
    expect(isPersonaSharedAcrossBrands(owned)).toBe(false);
    expect(isPersonaSharedAcrossBrands(all)).toBe(true);
    expect(isPersonaSharedAcrossBrands(selected)).toBe(true);
    expect(
      isPersonaSharedAcrossBrands({ ...selected, availableBrandIds: ['a'] }),
    ).toBe(false);
    expect(hasSharedAvailability(owned)).toBe(false);
    expect(hasSharedAvailability(selected)).toBe(true);
  });

  it('builds the one-query brand filter', () => {
    expect(brandAvailabilityWhere('b')).toEqual({
      OR: [
        { brandId: 'b' },
        { availabilityMode: PersonaAvailabilityMode.ALL_BRANDS },
        {
          availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
          availableBrandIds: { has: 'b' },
        },
      ],
    });
  });

  it('resolves visible brand ids', () => {
    expect(resolvePersonaBrandIds(all, ['a', 'b', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(resolvePersonaBrandIds(selected, ['a', 'b', 'c'])).toEqual([
      'a',
      'b',
    ]);
    expect(resolvePersonaBrandIds(owned, ['a', 'b', 'c'])).toEqual(['a']);
  });
});
