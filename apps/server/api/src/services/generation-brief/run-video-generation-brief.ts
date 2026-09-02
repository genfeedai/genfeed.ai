import { assembleVideoGenerationBrief } from '@api/services/generation-brief/assemble-video-generation-brief';
import { assertRedactedVideoGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { resolveVideoGenerationBriefSupport } from '@api/services/generation-brief/resolve-video-generation-brief-support';
import { resolveVideoGenerationFidelityMode } from '@api/services/generation-brief/resolve-video-generation-fidelity-mode';
import { getVideoGenerationBriefRegistryEntry } from '@api/services/generation-brief/video-generation-brief-registry';
import type {
  GenerationBriefReference,
  GenerationFidelityMode,
  VideoGenerationBrief,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { GenerationBriefSurface } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { buildGenerationBriefCompileSource } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import type { VideoGenerationBriefPersistedEvidence } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import { buildVideoGenerationBriefExemptionSource } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ServiceUnavailableException } from '@nestjs/common';

export interface RunVideoGenerationBriefInput {
  actionVerb?:
    | 'generate'
    | 'interpolate'
    | 'reference_video'
    | 'extend'
    | 'upscale';
  audioDirection?: string;
  avoid?: string[];
  brandingMode?: 'off' | 'brand';
  cameraMovement?: string;
  fidelityMode?: GenerationFidelityMode;
  composition?: string;
  durationSeconds?: number;
  endFrameId?: string;
  height: number;
  isBrandingEnabled?: boolean;
  lighting?: string;
  model: string;
  motion?: string;
  objective: string;
  referenceIds?: string[];
  references?: readonly GenerationBriefReference[];
  resolution?: string;
  scene?: string;
  seed?: number;
  surface: GenerationBriefSurface;
  visualDirection?: string;
  videoReferenceIds?: string[];
  width: number;
}

export interface RunVideoGenerationBriefResult {
  brief?: VideoGenerationBrief;
  dispatch?: Record<string, unknown>;
  evidence: VideoGenerationBriefPersistedEvidence;
  generationSource: string;
}

function resolveVideoActionVerb(appliedFields: string[]) {
  if (appliedFields.includes('references.reference_video')) {
    return 'reference_video' as const;
  }
  if (
    appliedFields.includes('references.first_frame') &&
    appliedFields.includes('references.last_frame')
  ) {
    return 'interpolate' as const;
  }
  return 'generate' as const;
}

/**
 * Shared assemble/compile/exempt entry for every video-generation surface.
 * MCP and the agent conversational tool proxy `/v1/videos` and therefore use
 * `studio`.
 */
export function runVideoGenerationBrief(
  input: RunVideoGenerationBriefInput,
): RunVideoGenerationBriefResult {
  const support = resolveVideoGenerationBriefSupport(input.model);
  if (support.kind === 'exempt') {
    return {
      evidence: assertRedactedVideoGenerationBriefEvidence({
        actionVerb: 'generate',
        compilerId: null,
        compilerVersion: null,
        dispatchMode: 'native',
        modelKey: support.modelKey,
        profileId: null,
        profileVersion: null,
        reason: support.reason,
        status: 'exempted',
        surface: input.surface,
      }),
      generationSource: buildVideoGenerationBriefExemptionSource(
        support.reason,
      ),
    };
  }

  const entry = getVideoGenerationBriefRegistryEntry(support.modelKey);
  if (!entry) {
    throw new ServiceUnavailableException(
      `Generation brief compiler configuration is unavailable for model "${support.modelKey}".`,
    );
  }

  const fidelityMode = resolveVideoGenerationFidelityMode({
    brandingMode: input.brandingMode,
    fidelityMode: input.fidelityMode,
    isBrandingEnabled: input.isBrandingEnabled,
  });
  const brief = assembleVideoGenerationBrief({
    audioDirection: input.audioDirection,
    avoid: input.avoid,
    composition: input.composition,
    durationSeconds: input.durationSeconds,
    endFrameId: input.endFrameId,
    fidelityMode,
    height: input.height,
    lighting: input.lighting,
    motion: input.motion ?? input.cameraMovement,
    objective: input.objective,
    referenceIds: input.referenceIds,
    references: input.references,
    resolution: input.resolution,
    scene: input.scene,
    visualDirection: input.visualDirection,
    visualDirectionSource: 'user',
    videoReferenceIds: input.videoReferenceIds,
    width: input.width,
  });
  const compiled = entry.compile({
    brief,
    modelKey: support.modelKey,
    seed: input.seed,
  });
  const dispatch =
    input.actionVerb === 'extend' &&
    support.modelKey === MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5 &&
    compiled.dispatch
      ? { ...compiled.dispatch, aspect_ratio: 'adaptive', duration: -1 }
      : compiled.dispatch;

  return {
    brief: compiled.brief,
    dispatch,
    evidence: assertRedactedVideoGenerationBriefEvidence({
      ...compiled.evidence,
      actionVerb:
        input.actionVerb ??
        resolveVideoActionVerb(
          compiled.evidence.status === 'compiled'
            ? compiled.evidence.appliedFields
            : [],
        ),
      dispatchMode: 'native',
      surface: input.surface,
    }),
    generationSource: buildGenerationBriefCompileSource({
      compilerId: entry.compilerId,
      compilerVersion: entry.compilerVersion,
      profileId: entry.profileId,
      profileVersion: entry.profileVersion,
    }),
  };
}
