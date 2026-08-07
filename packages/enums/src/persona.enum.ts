/**
 * Persona lifecycle. Values match Prisma `PersonaStatus` (SCREAMING_SNAKE).
 * @see packages/prisma/prisma/schema.prisma `enum PersonaStatus`
 */
export enum PersonaStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
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
