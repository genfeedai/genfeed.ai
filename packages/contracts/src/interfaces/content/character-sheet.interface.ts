import type { PersonaAvailabilityMode } from '../../enums/persona.enum';

export type BrandCharacterSheetStep = 'describe' | 'candidate' | 'approve';

export interface CharacterAvailability {
  availabilityMode: PersonaAvailabilityMode;
  availableBrandIds: string[];
}

/** Accepts both the contract enum and Prisma's persisted label union. */
export interface PersonaAvailabilityFields {
  availabilityMode?: `${PersonaAvailabilityMode}` | null;
  availableBrandIds?: readonly string[] | null;
  brandId?: string | null;
}

export interface CharacterAvailabilityInput {
  brandIds?: string[];
  mode: PersonaAvailabilityMode;
}

export interface BrandCharacterListItem {
  availabilityMode?: PersonaAvailabilityMode;
  availableBrandCount?: number;
  availableBrandIds?: string[];
  avatarIngredientId?: string | null;
  /** Owning organization of a character granted to this one (#6037). */
  grantedByOrganizationName?: string | null;
  handle?: string | null;
  id: string;
  isGranted?: boolean;
  isShared?: boolean;
  label: string;
  owningBrandId?: string | null;
  owningBrandName?: string | null;
}

export interface BrandCharacterCandidate {
  id: string;
  url: string;
}

export interface ComposeCharacterSheetPromptInput {
  description: string;
  isNonHumanoid?: boolean;
}

export interface ComposeCharacterSheetPromptResult {
  prompt: string;
}

export interface CreatePersonaFromSheetInput {
  assetId: string;
  availability?: CharacterAvailabilityInput;
  handle: string;
  label: string;
}

export interface GenerateCharacterSheetInput {
  brandId: string;
  description: string;
  isNonHumanoid: boolean;
  seed?: number;
}

export interface CharacterImageInspection {
  id: string;
  hasFace: boolean | null;
  isCharacter: boolean | null;
  characterId: string | null;
  handle: string | null;
  label: string | null;
}

/** An active use-only grant of a character to another organization (#6037). */
export interface CharacterGrantItem {
  availabilityMode: PersonaAvailabilityMode;
  availableBrandIds: string[];
  grantedAt: string;
  id: string;
  recipientOrganizationId: string;
  recipientOrganizationName: string;
}

export interface CharacterGrantInput {
  brandIds?: string[];
  mode: PersonaAvailabilityMode;
  recipientOrganizationId: string;
}

export interface GrantableOrganization {
  brands: Array<{ id: string; label: string }>;
  id: string;
  label: string;
}
