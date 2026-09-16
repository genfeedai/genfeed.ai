import { REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-video-generation-brief-families';
import type { GenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { VideoGenerationCapabilityReferences } from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import {
  MINIMAX_H3_CAPABILITY_PROFILE,
  MINIMAX_H3_MODEL_KEY,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE,
  PRUNAAI_P_VIDEO_MODEL_KEY,
} from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import type {
  ClipChainIdentityReference,
  VideoGenerationFrameRole,
  VideoGenerationIdentityLock,
} from '@genfeedai/contracts/interfaces';

export interface ResolveVideoIdentityReferencePlanInput {
  /** This shot's opening still — a last-frame handoff or an opening image. */
  firstFrameAssetId?: string;
  identityReferences: readonly ClipChainIdentityReference[];
  /** Optional interpolation target supplied by the author for this segment. */
  lastFrameAssetId?: string;
  modelKey: string;
}

export interface VideoIdentityReferencePlan {
  /** Last-frame asset to keep on the brief, when the profile can take it. */
  endFrameId?: string;
  identityLock: VideoGenerationIdentityLock;
  /** Brief references with roles; frame roles are omitted when they conflict. */
  references: GenerationBriefReference[];
}

/**
 * Capability references for a registered video model. Mirrors the registry
 * shape (`video-generation-brief-registry.ts`) without pulling the compilers.
 */
export function resolveVideoCapabilityReferences(
  modelKey: string,
): VideoGenerationCapabilityReferences | undefined {
  if (modelKey === PRUNAAI_P_VIDEO_MODEL_KEY) {
    return PRUNAAI_P_VIDEO_CAPABILITY_PROFILE.references;
  }
  if (modelKey === MINIMAX_H3_MODEL_KEY) {
    return MINIMAX_H3_CAPABILITY_PROFILE.references;
  }
  for (const family of REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES) {
    const profile = family.profiles.find(
      (candidate) => candidate.modelKey === modelKey,
    );
    if (profile) {
      return profile.references;
    }
  }
  return undefined;
}

/**
 * Conflict rule for identity-locked video segments (#4653).
 *
 * Identity stills are who / what / where and ride every segment. The start
 * frame is this shot's opening (often the previous segment's last-frame
 * extract) and the last frame is an optional interpolation target — neither
 * is identity. When the selected model has a multi-image identity field the
 * roles coexist. When it only has frame slots, identity wins: the primary
 * character still takes the start-frame slot, the frame handoff is omitted,
 * and the omission is recorded so QA and operators can see it. A model with
 * no image input at all cannot honor an identity lock and fails closed.
 */
export function resolveVideoIdentityReferencePlan(
  input: ResolveVideoIdentityReferencePlanInput,
): VideoIdentityReferencePlan {
  const identityReferences = input.identityReferences.map((reference) => ({
    assetId: reference.assetId,
    role: reference.role,
  }));
  if (identityReferences.length === 0) {
    throw new Error('Identity-locked video generation requires identity refs');
  }

  const capability = resolveVideoCapabilityReferences(input.modelKey);
  if (!capability) {
    throw new Error(
      `Model "${input.modelKey}" has no capability profile and cannot honor identity references.`,
    );
  }

  const roles = new Set(capability.roles);
  const supportsIdentityStills = identityReferences.every((reference) =>
    roles.has(reference.role),
  );
  const supportsFirstFrame = roles.has('first_frame');
  const supportsLastFrame = roles.has('last_frame');
  const omittedFrameRoles: VideoGenerationFrameRole[] = [];

  if (supportsIdentityStills) {
    const references: GenerationBriefReference[] = [];
    if (input.firstFrameAssetId) {
      references.push({
        assetId: input.firstFrameAssetId,
        role: 'first_frame',
      });
    }
    references.push(...identityReferences);
    let endFrameId: string | undefined;
    if (input.lastFrameAssetId) {
      if (supportsLastFrame && input.firstFrameAssetId) {
        endFrameId = input.lastFrameAssetId;
      } else {
        omittedFrameRoles.push('last_frame');
      }
    }
    return {
      ...(endFrameId ? { endFrameId } : {}),
      identityLock: {
        omittedFrameRoles,
        omittedReferences: [],
        references: identityReferences,
        ...(omittedFrameRoles.length > 0
          ? {
              reason: `${input.modelKey} cannot combine identity stills with the last-frame target; the frame role was omitted.`,
            }
          : {}),
      },
      references,
    };
  }

  if (!supportsFirstFrame) {
    throw new Error(
      `Model "${input.modelKey}" accepts no image references and cannot honor an identity lock; select a model with image references.`,
    );
  }

  // Only frame slots: the primary character still becomes the start frame so
  // the person is the sheet, not the previous clip's last frame.
  const [primary, ...rest] = identityReferences;
  if (input.firstFrameAssetId) {
    omittedFrameRoles.push('first_frame');
  }
  const references: GenerationBriefReference[] = [
    { assetId: primary.assetId, role: 'subject' },
  ];
  let endFrameId: string | undefined;
  if (input.lastFrameAssetId) {
    if (supportsLastFrame) {
      endFrameId = input.lastFrameAssetId;
    } else {
      omittedFrameRoles.push('last_frame');
    }
  }

  return {
    ...(endFrameId ? { endFrameId } : {}),
    identityLock: {
      omittedFrameRoles,
      omittedReferences: rest,
      reason: `${input.modelKey} accepts a single still; identity stills win over the frame handoff.`,
      references: [primary],
    },
    references,
  };
}
