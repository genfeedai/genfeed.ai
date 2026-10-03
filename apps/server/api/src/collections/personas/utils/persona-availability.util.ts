import {
  type PersonaAvailabilityFields,
  PersonaAvailabilityMode,
} from '@genfeedai/contracts';

export function isPersonaSharedAcrossBrands(
  persona: PersonaAvailabilityFields,
): boolean {
  if (persona.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS) {
    return true;
  }
  if (persona.availabilityMode === PersonaAvailabilityMode.SELECTED_BRANDS) {
    const brandIds = new Set(persona.availableBrandIds ?? []);
    if (persona.brandId) {
      brandIds.add(persona.brandId);
    }
    return brandIds.size > 1;
  }
  return false;
}

/** True when the character has been opened beyond its owning brand. */
export function hasSharedAvailability(
  persona: PersonaAvailabilityFields,
): boolean {
  return (
    persona.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS ||
    persona.availabilityMode === PersonaAvailabilityMode.SELECTED_BRANDS
  );
}

/** True when the character is owned by, or made available to, `brandId`. */
export function isPersonaAvailableToBrand(
  persona: PersonaAvailabilityFields,
  brandId: string | null | undefined,
): boolean {
  if (!brandId) {
    return false;
  }
  if (persona.brandId === brandId) {
    return true;
  }
  if (persona.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS) {
    return true;
  }
  return (
    persona.availabilityMode === PersonaAvailabilityMode.SELECTED_BRANDS &&
    (persona.availableBrandIds ?? []).includes(brandId)
  );
}

/**
 * Prisma filter for "characters brand X can use": owned by X, available to
 * every brand, or listing X. One indexed query, no per-row lookups.
 */
export function brandAvailabilityWhere(brandId: string) {
  return {
    OR: [
      { brandId },
      { availabilityMode: PersonaAvailabilityMode.ALL_BRANDS },
      {
        availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
        availableBrandIds: { has: brandId },
      },
    ],
  };
}

/** Brand ids a character is visible in, given every brand of its organization. */
export function resolvePersonaBrandIds(
  persona: PersonaAvailabilityFields,
  organizationBrandIds: readonly string[],
): string[] {
  if (persona.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS) {
    return [...organizationBrandIds];
  }
  const brandIds = new Set<string>(
    persona.availabilityMode === PersonaAvailabilityMode.SELECTED_BRANDS
      ? (persona.availableBrandIds ?? [])
      : [],
  );
  if (persona.brandId) {
    brandIds.add(persona.brandId);
  }
  return [...brandIds];
}
