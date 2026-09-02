/**
 * Shared helpers reused by every per-family image generation-brief compiler.
 *
 * Generalizes the FLUX Schnell compiler's internal helpers
 * (`compile-flux-schnell-generation-brief.ts`) so each new model-family
 * compiler stays a thin, provider-specific dispatch mapping rather than
 * re-deriving prompt joining, omitted-signal bookkeeping, aspect-ratio
 * resolution, and reference selection from scratch.
 */

import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type {
  GenerationFidelityMode,
  GenerationFidelityPolicy,
  ImageGenerationBrief,
  ImageGenerationBriefReference,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { GENERATION_BRIEF_CONTRACT_VERSION } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { normalizeAspectRatioForModel } from '@genfeedai/helpers';

export function joinGenerationBriefPromptParts(parts: string[]): string {
  return parts
    .map((part) => part.trim().replace(/\.+$/u, ''))
    .filter((part) => part.length > 0)
    .join('. ');
}

export function recordOmittedGenerationBriefSignal(
  omitted: GenerationBriefOmittedSignal[],
  field: string,
  reason: string,
  policy: GenerationFidelityPolicy,
  required: boolean,
  modelLabel: string,
): void {
  if (!policy.applyConstraints && !required) {
    return;
  }

  if (required && policy.unsupportedConstraintBehavior === 'reject') {
    throw new GenerationBriefCompileError(
      `${modelLabel} cannot honor required ${field}.`,
      'unsupported_required_signal',
    );
  }

  omitted.push({ field, reason });
}

export function resolveImageGenerationBriefAspectRatio(
  modelKey: string,
  brief: ImageGenerationBrief,
  defaultAspectRatio: string,
): string {
  const requested = brief.output.aspectRatio ?? defaultAspectRatio;
  return normalizeAspectRatioForModel(modelKey, requested);
}

export interface BuildImageGenerationBriefPromptInput {
  brief: ImageGenerationBrief;
  maxCharacters: number;
  modelLabel: string;
  omitted: GenerationBriefOmittedSignal[];
  policy: GenerationFidelityPolicy;
  supportsNegativePrompt: boolean;
}

export interface ImageGenerationBriefPromptResult {
  appliedConstraintFields: string[];
  negativePrompt?: string;
  prompt: string;
}

/**
 * Builds the positive prompt (and, only when `supportsNegativePrompt` is
 * true, a negative prompt) from a canonical image brief. `avoid` constraints
 * either feed the negative prompt (families with a real negative-prompt
 * dispatch field — currently only Qwen Image) or are recorded as an omitted
 * signal (every other family, mirroring FLUX Schnell).
 */
export function buildImageGenerationBriefPrompt(
  input: BuildImageGenerationBriefPromptInput,
): ImageGenerationBriefPromptResult {
  const {
    brief,
    maxCharacters,
    modelLabel,
    omitted,
    policy,
    supportsNegativePrompt,
  } = input;
  const parts: string[] = [brief.intent.objective];

  if (brief.intent.subjects.length > 0) {
    parts.push(brief.intent.subjects.join(', '));
  }
  if (brief.intent.scene) {
    parts.push(brief.intent.scene);
  }
  if (brief.intent.composition) {
    parts.push(brief.intent.composition);
  }
  if (brief.intent.lighting) {
    parts.push(brief.intent.lighting);
  }
  if (brief.intent.visualDirection) {
    parts.push(brief.intent.visualDirection);
  }
  if (brief.intent.requestedText.length > 0) {
    parts.push(`Visible text: ${brief.intent.requestedText.join(', ')}`);
  }

  const negativeParts: string[] = [];
  const appliedConstraintFields: string[] = [];

  if (policy.applyConstraints) {
    for (const constraint of brief.constraints) {
      if (
        constraint.kind === 'desired_outcome' ||
        constraint.kind === 'exact_composition'
      ) {
        parts.push(constraint.value);
        appliedConstraintFields.push(`constraints.${constraint.kind}`);
        continue;
      }

      if (supportsNegativePrompt) {
        negativeParts.push(constraint.value);
        appliedConstraintFields.push(`constraints.${constraint.kind}`);
        continue;
      }

      recordOmittedGenerationBriefSignal(
        omitted,
        `constraints.${constraint.kind}`,
        `${modelLabel} has no native negative-prompt field.`,
        policy,
        constraint.required,
        modelLabel,
      );
    }
  }

  const prompt = joinGenerationBriefPromptParts(parts);
  if (!prompt) {
    throw new GenerationBriefCompileError(
      `${modelLabel} compilation produced an empty prompt.`,
      'invalid_brief',
    );
  }
  if (prompt.length > maxCharacters) {
    throw new GenerationBriefCompileError(
      `${modelLabel} prompt exceeds the capability profile character limit.`,
      'invalid_brief',
    );
  }

  const negativePrompt =
    negativeParts.length > 0
      ? joinGenerationBriefPromptParts(negativeParts)
      : undefined;

  return { appliedConstraintFields, negativePrompt, prompt };
}

export interface SelectedImageGenerationBriefReferences {
  excludedCount: number;
  included: ImageGenerationBriefReference[];
}

export function selectImageGenerationBriefReferences(
  brief: ImageGenerationBrief,
  maxReferences: number,
): SelectedImageGenerationBriefReferences {
  const included = brief.references.slice(0, maxReferences);
  const excludedCount = Math.max(0, brief.references.length - maxReferences);
  return { excludedCount, included };
}

export function recordExcessImageGenerationBriefReferences(
  omitted: GenerationBriefOmittedSignal[],
  excludedCount: number,
  maxReferences: number,
  policy: GenerationFidelityPolicy,
  fidelityMode: GenerationFidelityMode,
  modelLabel: string,
): void {
  if (excludedCount <= 0) {
    return;
  }

  recordOmittedGenerationBriefSignal(
    omitted,
    'references',
    `${modelLabel} accepts at most ${maxReferences} reference image(s); ${excludedCount} extra reference(s) were omitted.`,
    policy,
    fidelityMode === 'strict',
    modelLabel,
  );
}

/**
 * For families whose provider field is mandatory (e.g. Ideogram Character's
 * `character_reference_image`), this is a structural dispatch requirement —
 * not a fidelity-policy trade-off. It must throw regardless of fidelity mode.
 */
export function assertRequiredImageGenerationBriefReference(
  brief: ImageGenerationBrief,
  modelLabel: string,
): void {
  if (brief.references.length === 0) {
    throw new GenerationBriefCompileError(
      `${modelLabel} requires at least one reference image.`,
      'unsupported_required_signal',
    );
  }
}

export function recordUnsupportedImageGenerationBriefReferences(
  omitted: GenerationBriefOmittedSignal[],
  brief: ImageGenerationBrief,
  policy: GenerationFidelityPolicy,
  modelLabel: string,
): void {
  if (brief.references.length === 0) {
    return;
  }

  recordOmittedGenerationBriefSignal(
    omitted,
    'references',
    `${modelLabel} has no native reference-image field.`,
    policy,
    brief.fidelityMode === 'strict',
    modelLabel,
  );
}

/**
 * Builds the `appliedFields` evidence list shared by every family compiler:
 * always-present intent fields, conditionally-present intent fields, the
 * constraint fields the prompt builder actually applied, and `seed` when
 * dispatched. Mirrors FLUX Schnell's inline `appliedFields` assembly.
 */
export function buildImageGenerationBriefAppliedFields(input: {
  appliedConstraintFields: string[];
  brief: ImageGenerationBrief;
  hasSeed: boolean;
}): string[] {
  const { appliedConstraintFields, brief, hasSeed } = input;
  return [
    'intent.objective',
    'output.aspectRatio',
    ...(brief.intent.subjects.length > 0 ? ['intent.subjects'] : []),
    ...(brief.intent.scene ? ['intent.scene'] : []),
    ...(brief.intent.composition ? ['intent.composition'] : []),
    ...(brief.intent.lighting ? ['intent.lighting'] : []),
    ...(brief.intent.visualDirection ? ['intent.visualDirection'] : []),
    ...(brief.intent.requestedText.length > 0 ? ['intent.requestedText'] : []),
    ...appliedConstraintFields,
    ...(hasSeed ? ['seed'] : []),
  ];
}

export interface BuildImageGenerationBriefEvidenceInput {
  appliedFields: string[];
  brief: ImageGenerationBrief;
  compilerId: string;
  compilerVersion: number;
  hasSeed: boolean;
  modelKey: string;
  numOutputs: number;
  omitted: GenerationBriefOmittedSignal[];
  outputAspectRatio: string;
  outputFormat: string;
  profileId: string;
  profileVersion: number;
  /** Dispatched reference ids. Defaults to every brief reference. */
  referenceAssetIds?: string[];
}

/**
 * Builds the redactable evidence object shared by every family compiler.
 * Callers still pass this through `assertRedactedGenerationBriefEvidence`
 * (or rely on the caller of the compiler doing so) — this helper only
 * removes the boilerplate of assembling the object literal per family.
 */
export function buildImageGenerationBriefEvidence(
  input: BuildImageGenerationBriefEvidenceInput,
): GenerationBriefCompileEvidence {
  return {
    appliedFields: input.appliedFields,
    briefVersion: GENERATION_BRIEF_CONTRACT_VERSION,
    compilerId: input.compilerId,
    compilerVersion: input.compilerVersion,
    fidelityMode: input.brief.fidelityMode,
    mediaKind: 'image',
    modelKey: input.modelKey,
    omittedSignals: input.omitted,
    output: {
      aspectRatio: input.outputAspectRatio,
      hasSeed: input.hasSeed,
      numOutputs: input.numOutputs,
      outputFormat: input.outputFormat,
    },
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    referenceAssetIds:
      input.referenceAssetIds ??
      input.brief.references.map((reference) => reference.assetId),
    status: 'compiled',
  };
}
