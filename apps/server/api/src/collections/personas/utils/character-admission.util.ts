import { isPersonaAvailableToBrand } from '@api/collections/personas/utils/persona-availability.util';
import type { PersonaAvailabilityFields } from '@genfeedai/contracts/interfaces';

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
  /**
   * Avatar ids that belong to a character granted by another organization,
   * mapped to that owning organization (#6037).
   */
  grantedAvatarOwners: Map<string, string>;
  /** Character to link the output to, or null when no character is involved. */
  personaId: string | null;
  /** Admitted character per input asset, for paths that fan out outputs. */
  personaIdByAssetId: Map<string, string>;
}

interface OwnCharacterRow extends PersonaAvailabilityFields {
  avatarIngredientId: string | null;
  id: string;
  ingredients: readonly { id: string }[];
}

interface GrantedCharacterRow
  extends Omit<PersonaAvailabilityFields, 'brandId'> {
  ownerOrganizationId: string;
  persona: {
    avatarIngredientId: string | null;
    id: string;
    ingredients: readonly { id: string }[];
  };
}

interface Candidate {
  avatarId: string | null;
  hasOutputs: boolean;
  isUsable: boolean;
  outputIds: readonly string[];
  owner?: string;
  personaId: string;
}

/**
 * Decides admission for the assets of one request against the organization's
 * own characters and the characters granted to it (#6037). A group of
 * candidates for one asset (the avatar of a character, or an output linked to
 * one) is refused when it exists and none is usable by the brand; a revoked
 * grant is simply absent, so outputs it linked stay usable.
 */
export function evaluateCharacterAdmission(params: {
  brandId: string | null | undefined;
  grantRows: readonly GrantedCharacterRow[];
  ids: readonly string[];
  onRefused: (refused: { assetId: string; personaIds: string[] }) => never;
  rows: readonly OwnCharacterRow[];
}): CharacterAdmission {
  const candidates: Candidate[] = [
    ...params.rows.map((row) => ({
      avatarId: row.avatarIngredientId,
      // An output linked to a character with no owning brand was never
      // brand-scoped, so only avatars of such characters are refused.
      hasOutputs: row.brandId !== null,
      isUsable: isPersonaAvailableToBrand(row, params.brandId),
      outputIds: row.ingredients.map((ingredient) => ingredient.id),
      personaId: row.id,
    })),
    ...params.grantRows.map((grant) => ({
      avatarId: grant.persona.avatarIngredientId,
      hasOutputs: true,
      isUsable: isPersonaAvailableToBrand(
        { ...grant, brandId: null },
        params.brandId,
      ),
      outputIds: grant.persona.ingredients.map((ingredient) => ingredient.id),
      owner: grant.ownerOrganizationId,
      personaId: grant.persona.id,
    })),
  ];
  const admission = noCharacterAdmission();
  for (const id of params.ids) {
    const avatarOwners = candidates.filter(
      (candidate) => candidate.avatarId === id,
    );
    const outputOwners = candidates.filter(
      (candidate) => candidate.hasOutputs && candidate.outputIds.includes(id),
    );
    for (const owners of [avatarOwners, outputOwners]) {
      if (owners.length === 0) {
        continue;
      }
      const usable = owners.find((candidate) => candidate.isUsable);
      if (!usable) {
        return params.onRefused({
          assetId: id,
          personaIds: owners.map((candidate) => candidate.personaId),
        });
      }
      if (owners === avatarOwners) {
        admission.availableAvatarIds.add(id);
        if (usable.owner) {
          admission.grantedAvatarOwners.set(id, usable.owner);
        }
      }
      admission.personaId ??= usable.personaId;
      if (!admission.personaIdByAssetId.has(id)) {
        admission.personaIdByAssetId.set(id, usable.personaId);
      }
    }
  }
  return admission;
}

export function noCharacterAdmission(): CharacterAdmission {
  return {
    availableAvatarIds: new Set(),
    grantedAvatarOwners: new Map(),
    personaId: null,
    personaIdByAssetId: new Map(),
  };
}
