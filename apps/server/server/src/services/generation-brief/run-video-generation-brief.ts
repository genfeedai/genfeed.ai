import { assembleVideoGenerationBrief } from '@server/services/generation-brief/assemble-video-generation-brief';
import { compileMinimaxH3GenerationBrief } from '@server/services/generation-brief/compile-minimax-h3-generation-brief';
import { compilePrunaaiPVideoGenerationBrief } from '@server/services/generation-brief/compile-prunaai-p-video-generation-brief';
import { assertRedactedVideoGenerationBriefEvidence } from '@server/services/generation-brief/redact-generation-brief-evidence';
import { resolveVideoGenerationBriefSupport } from '@server/services/generation-brief/resolve-video-generation-brief-support';
import { resolveVideoGenerationFidelityMode } from '@server/services/generation-brief/resolve-video-generation-fidelity-mode';
import type {
  GenerationBriefReference,
  VideoGenerationBrief,
} from '@api-types/contracts/generation-brief.contract';
import type { GenerationBriefSurface } from '@api-types/contracts/generation-brief-compiler.contract';
import type {
  MinimaxH3Dispatch,
  PrunaaiPVideoDispatch,
  VideoGenerationBriefPersistedEvidence,
} from '@api-types/contracts/video-generation-brief-compiler.contract';
import {
  buildMinimaxH3GenerationSource,
  buildPrunaaiPVideoGenerationSource,
  buildVideoGenerationBriefExemptionSource,
  PRUNAAI_P_VIDEO_COMPILER_ID,
} from '@api-types/contracts/video-generation-brief-compiler.contract';

export interface RunVideoGenerationBriefInput {
  audioDirection?: string;
  avoid?: string[];
  brandingMode?: 'off' | 'brand';
  cameraMovement?: string;
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
  dispatch?: MinimaxH3Dispatch | PrunaaiPVideoDispatch;
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

  const fidelityMode = resolveVideoGenerationFidelityMode({
    brandingMode: input.brandingMode,
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
  const isPrunaaiPVideo = support.compilerId === PRUNAAI_P_VIDEO_COMPILER_ID;
  const compiled = isPrunaaiPVideo
    ? compilePrunaaiPVideoGenerationBrief({
        brief,
        seed: input.seed,
      })
    : compileMinimaxH3GenerationBrief({
        brief,
        seed: input.seed,
      });

  return {
    brief: compiled.brief,
    dispatch: compiled.dispatch,
    evidence: assertRedactedVideoGenerationBriefEvidence({
      ...compiled.evidence,
      surface: input.surface,
    }),
    generationSource: isPrunaaiPVideo
      ? buildPrunaaiPVideoGenerationSource()
      : buildMinimaxH3GenerationSource(),
  };
}
