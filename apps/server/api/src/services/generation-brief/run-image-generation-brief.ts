import { assembleImageGenerationBrief } from '@api/services/generation-brief/assemble-image-generation-brief';
import type { ImageGenerationBriefDispatch } from '@api/services/generation-brief/image-generation-brief-registry';
import { getImageGenerationBriefRegistryEntry } from '@api/services/generation-brief/image-generation-brief-registry';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { resolveImageGenerationBriefSupport } from '@api/services/generation-brief/resolve-image-generation-brief-support';
import { resolveImageGenerationFidelityMode } from '@api/services/generation-brief/resolve-image-generation-fidelity-mode';
import type {
  GenerationFidelityMode,
  ImageGenerationBrief,
  ImageGenerationBriefReference,
} from '@api-types/contracts/generation-brief.contract';
import type {
  GenerationBriefPersistedEvidence,
  GenerationBriefSurface,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  buildGenerationBriefCompileSource,
  buildGenerationBriefExemptionSource,
} from '@api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ImageTaskModel } from '@genfeedai/enums';
import { ServiceUnavailableException } from '@nestjs/common';

export interface RunImageGenerationBriefInput {
  avoid?: string[];
  brandingMode?: 'off' | 'brand';
  composition?: string;
  fidelityMode?: GenerationFidelityMode;
  height: number;
  isBrandingEnabled?: boolean;
  lighting?: string;
  model: string;
  objective: string;
  referenceIds?: string[];
  references?: readonly ImageGenerationBriefReference[];
  scene?: string;
  seed?: number;
  surface: GenerationBriefSurface;
  visualDirection?: string;
  width: number;
}

export interface RunImageGenerationBriefResult {
  brief?: ImageGenerationBrief;
  dispatch?: ImageGenerationBriefDispatch;
  evidence: GenerationBriefPersistedEvidence;
  generationSource: string;
}

const IMAGE_TASK_MODEL_KEYS: Record<string, string> = {
  [ImageTaskModel.FAL]: MODEL_KEYS.FAL_FLUX_DEV,
  [ImageTaskModel.IMAGEN4]: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
  [ImageTaskModel.LEONARDO]: MODEL_KEYS.LEONARDOAI,
  [ImageTaskModel.REPLICATE]: MODEL_KEYS.SDXL,
  [ImageTaskModel.SDXL]: MODEL_KEYS.SDXL,
};

export function resolveImageGenerationBriefModelKey(model: string): string {
  return IMAGE_TASK_MODEL_KEYS[model] ?? model;
}

/**
 * Shared assemble/compile/exempt entry for every image-generation surface.
 * Callers stamp `surface` so provenance is honest even when compilation is
 * exempted. MCP and the agent conversational tool proxy `/v1/images` and
 * therefore use `studio`.
 */
export function runImageGenerationBrief(
  input: RunImageGenerationBriefInput,
): RunImageGenerationBriefResult {
  const modelKey = resolveImageGenerationBriefModelKey(input.model);
  const support = resolveImageGenerationBriefSupport(modelKey);
  if (support.kind === 'exempt') {
    return {
      evidence: assertRedactedGenerationBriefEvidence({
        compilerId: null,
        compilerVersion: null,
        modelKey: support.modelKey,
        profileId: null,
        profileVersion: null,
        reason: support.reason,
        status: 'exempted',
        surface: input.surface,
      }),
      generationSource: buildGenerationBriefExemptionSource(support.reason),
    };
  }

  const entry = getImageGenerationBriefRegistryEntry(support.modelKey);
  if (!entry) {
    throw new ServiceUnavailableException(
      `Generation brief compiler configuration is unavailable for model "${support.modelKey}".`,
    );
  }

  // Operator-supplied avoid terms are independent of brand styling. They must
  // remain active even when branding is off so compilers with a native
  // negative-prompt field can preserve them at dispatch.
  const fidelityMode =
    input.fidelityMode ??
    (input.avoid?.some((value) => value.trim().length > 0)
      ? 'guided'
      : resolveImageGenerationFidelityMode({
          brandingMode: input.brandingMode,
          isBrandingEnabled: input.isBrandingEnabled,
        }));
  const brief = assembleImageGenerationBrief({
    avoid: input.avoid,
    composition: input.composition,
    fidelityMode,
    height: input.height,
    lighting: input.lighting,
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
    evidence: assertRedactedGenerationBriefEvidence({
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
