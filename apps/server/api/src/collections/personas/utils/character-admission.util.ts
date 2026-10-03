/**
 * Generation paths that admit character references. The label is written to
 * the refusal log, so an audit can say which path a revoked brand tried.
 */
export const CHARACTER_ADMISSION_PATHS = [
  'agent-handles',
  'avatar-video',
  'image',
  'image-edit',
  'lip-sync',
  'storyboard',
  'video',
  'video-clip-chain',
  'video-extend',
  'video-interpolation',
  'workflow',
] as const;

export type CharacterAdmissionPath = (typeof CHARACTER_ADMISSION_PATHS)[number];

/** Outcome of admitting a request's character references. */
export interface CharacterAdmission {
  /** Reference ids that are a character's avatar the active brand may use. */
  availableAvatarIds: Set<string>;
  /** Character to link the output to, or null when no character is involved. */
  personaId: string | null;
  /** Admitted character per input asset, for paths that fan out outputs. */
  personaIdByAssetId: Map<string, string>;
}

export function noCharacterAdmission(): CharacterAdmission {
  return {
    availableAvatarIds: new Set(),
    personaId: null,
    personaIdByAssetId: new Map(),
  };
}
