import {
  brandKitSlotWhere,
  resolveBrandKitSlot,
} from '@api/collections/assets/utils/brand-kit-slot.util';
import { AssetCategory, BrandKitSlot } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('resolveBrandKitSlot', () => {
  it.each([
    [AssetCategory.LOGO, undefined, BrandKitSlot.LOGO_PRIMARY],
    [AssetCategory.BANNER, undefined, BrandKitSlot.BANNER_MASTER],
    [AssetCategory.LOGO, BrandKitSlot.LOGO_DARK, BrandKitSlot.LOGO_DARK],
    [AssetCategory.BANNER, BrandKitSlot.X_HEADER, BrandKitSlot.X_HEADER],
    [AssetCategory.REFERENCE, undefined, undefined],
  ])('%s with %s fills %s', (category, requested, expected) => {
    expect(resolveBrandKitSlot(category, requested)).toBe(expected);
  });

  it.each([
    [AssetCategory.LOGO, BrandKitSlot.YOUTUBE_BANNER],
    [AssetCategory.BANNER, BrandKitSlot.LOGO_ICON],
    [AssetCategory.REFERENCE, BrandKitSlot.LOGO_ICON],
  ])('refuses %s in slot %s', (category, requested) => {
    expect(() => resolveBrandKitSlot(category, requested)).toThrow(
      BadRequestException,
    );
  });
});

describe('brandKitSlotWhere', () => {
  it('retires slotless rows when the default slot is replaced', () => {
    expect(
      brandKitSlotWhere(AssetCategory.LOGO, BrandKitSlot.LOGO_PRIMARY),
    ).toEqual({
      OR: [{ kitSlot: 'LOGO_PRIMARY' }, { kitSlot: null }],
    });
  });

  it('retires only the same slot for another variant', () => {
    expect(
      brandKitSlotWhere(AssetCategory.LOGO, BrandKitSlot.LOGO_ICON),
    ).toEqual({ kitSlot: 'LOGO_ICON' });
  });
});
