import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type { BrandCharacterListItem } from '@genfeedai/contracts/interfaces';

/**
 * Whether the selected brand can manage a character: the API only accepts
 * reference and availability changes for characters the acting brand owns or
 * has been given, so an organization-wide list must not offer them for the rest.
 */
export function canBrandManageCharacter(
  character: BrandCharacterListItem,
  brandId: string | null | undefined,
): boolean {
  if (!brandId || character.isGranted) {
    return false;
  }
  if (character.owningBrandId === brandId) {
    return true;
  }
  if (character.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS) {
    return true;
  }
  return (
    character.availabilityMode === PersonaAvailabilityMode.SELECTED_BRANDS &&
    (character.availableBrandIds ?? []).includes(brandId)
  );
}
