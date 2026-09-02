/**
 * Voice provider. Values match Prisma `VoiceProvider`.
 * @see packages/prisma/prisma/schema.prisma `enum VoiceProvider`
 */
export enum VoiceProvider {
  HEYGEN = 'HEYGEN',
  ELEVENLABS = 'ELEVENLABS',
  HEDRA = 'HEDRA',
  GENFEED_AI = 'GENFEED_AI',
}

/**
 * Voice clone lifecycle. Values match Prisma `VoiceCloneStatus`.
 * @see packages/prisma/prisma/schema.prisma `enum VoiceCloneStatus`
 */
export enum VoiceCloneStatus {
  PENDING = 'PENDING',
  CLONING = 'CLONING',
  READY = 'READY',
  FAILED = 'FAILED',
}
