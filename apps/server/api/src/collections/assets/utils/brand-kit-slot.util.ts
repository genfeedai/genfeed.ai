import { AssetCategory, type BrandKitSlot } from '@genfeedai/contracts';
import {
  getDefaultBrandKitSlot,
  isBrandKitSlotForCategory,
} from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

type BrandKitSlotCategory = AssetCategory.LOGO | AssetCategory.BANNER;

export function isBrandKitSlotCategory(
  category: AssetCategory | string,
): category is BrandKitSlotCategory {
  return category === AssetCategory.LOGO || category === AssetCategory.BANNER;
}

/**
 * The slot a logo or banner write fills. No requested slot means the default
 * one (primary logo, master banner), which is what every caller wrote before
 * slots existed. A slot from the other category is refused: a banner cannot be
 * a logo variant. Other categories carry no slot.
 */
export function resolveBrandKitSlot(
  category: AssetCategory | string,
  requested?: BrandKitSlot | null,
): BrandKitSlot | undefined {
  if (!isBrandKitSlotCategory(category)) {
    if (requested) throw new BadRequestException('brand_kit_slot_not_allowed');
    return undefined;
  }
  if (!requested) return getDefaultBrandKitSlot(category);
  if (!isBrandKitSlotForCategory(requested, category)) {
    throw new BadRequestException('brand_kit_slot_category_mismatch');
  }
  return requested;
}

/**
 * Matches the live assets a write to `slot` replaces. A brand keeps one asset
 * per slot, and a row without a slot is the default slot, so replacing the
 * primary logo or master banner retires those rows too.
 */
export function brandKitSlotWhere(
  category: BrandKitSlotCategory,
  slot: BrandKitSlot,
): { kitSlot: BrandKitSlot } | { OR: { kitSlot: BrandKitSlot | null }[] } {
  return slot === getDefaultBrandKitSlot(category)
    ? { OR: [{ kitSlot: slot }, { kitSlot: null }] }
    : { kitSlot: slot };
}
