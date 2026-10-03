/**
 * Persona lifecycle. Values match Prisma `PersonaStatus` (SCREAMING_SNAKE).
 * @see packages/prisma/prisma/schema.prisma `enum PersonaStatus`
 */
export enum PersonaStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Which brands of the owning organization can use a character (#6009).
 * Values match Prisma `PersonaAvailabilityMode`.
 * @see packages/prisma/prisma/schema.prisma `enum PersonaAvailabilityMode`
 */
export enum PersonaAvailabilityMode {
  OWNING_BRAND = 'OWNING_BRAND',
  ALL_BRANDS = 'ALL_BRANDS',
  SELECTED_BRANDS = 'SELECTED_BRANDS',
}

/** Brand-unique character handles: lowercase URL-safe, 2–32 chars. */
export const PERSONA_HANDLE_PATTERN = /^[a-z0-9-_]{2,32}$/;

export function isPersonaHandle(value: string): boolean {
  return PERSONA_HANDLE_PATTERN.test(value);
}

export function normalizePersonaHandle(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }
  return normalized;
}

export enum AvatarProvider {
  HEYGEN = 'heygen',
  HEDRA = 'hedra',
}

export enum PersonaContentFormat {
  PHOTO = 'photo',
  VIDEO = 'video',
  REEL = 'reel',
  STORY = 'story',
  ARTICLE = 'article',
  AUDIO = 'audio',
  TEXT = 'text',
}

export enum LoraStatus {
  NONE = 'none',
  TRAINING = 'training',
  READY = 'ready',
  FAILED = 'failed',
}
