import type {
  GenerationBriefReference,
  GenerationFidelityMode,
  VideoGenerationBrief,
} from '@api-types/contracts/generation-brief.contract';
import type { GenerationBriefSurface } from '@api-types/contracts/generation-brief-compiler.contract';
import { buildGenerationBriefCompileSource } from '@api-types/contracts/generation-brief-compiler.contract';
import type { VideoGenerationBriefPersistedEvidence } from '@api-types/contracts/video-generation-brief-compiler.contract';
import { buildVideoGenerationBriefExemptionSource } from '@api-types/contracts/video-generation-brief-compiler.contract';
import { ServiceUnavailableException } from '@nestjs/common';
import { assembleVideoGenerationBrief } from '@server/services/generation-brief/assemble-video-generation-brief';
import { assertRedactedVideoGenerationBriefEvidence } from '@server/services/generation-brief/redact-generation-brief-evidence';
import { resolveVideoGenerationBriefSupport } from '@server/services/generation-brief/resolve-video-generation-brief-support';
import { resolveVideoGenerationFidelityMode } from '@server/services/generation-brief/resolve-video-generation-fidelity-mode';
import { getVideoGenerationBriefRegistryEntry } from '@server/services/generation-brief/video-generation-brief-registry';

export interface RunVideoGenerationBriefInput {
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
  scene?: string;
  seed?: number;
  surface: GenerationBriefSurface;
  visualDirection?: string;
  width: number;
}

export interface RunVideoGenerationBriefResult {
  brief?: VideoGenerationBrief;
  dispatch?: Record<string, unknown>;
  evidence: VideoGenerationBriefPersistedEvidence;
  generationSource: string;
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
        compilerId: null,
        compilerVersion: null,
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
    scene: input.scene,
    visualDirection: input.visualDirection,
    visualDirectionSource: 'user',
    width: input.width,
  });
  const compiled = entry.compile({
    brief,
    modelKey: support.modelKey,
    seed: input.seed,
  });

  return {
    brief: compiled.brief,
    dispatch: compiled.dispatch,
    evidence: assertRedactedVideoGenerationBriefEvidence({
      ...compiled.evidence,
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
