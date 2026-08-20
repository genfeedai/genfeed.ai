import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type {
  GenerationFidelityPolicy,
  ImageGenerationBrief,
} from '@api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@api-types/contracts/generation-brief.contract';
import type {
  FluxSchnellCompileResult,
  FluxSchnellDispatch,
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_SCHNELL_IMAGE_COMPILER_ID,
  FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
  fluxSchnellCompileResultSchema,
  GENERATION_BRIEF_CONTRACT_VERSION,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_SCHNELL_CAPABILITY_PROFILE,
  FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
  FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
  FLUX_SCHNELL_MODEL_KEY,
} from '@api-types/contracts/generation-capability-profile.contract';
import { normalizeAspectRatioForModel } from '@genfeedai/helpers';

export interface CompileFluxSchnellGenerationBriefInput {
  brief: ImageGenerationBrief;
  outputFormat?: string;
  seed?: number;
}

function joinPromptParts(parts: string[]): string {
  return parts
    .map((part) => part.trim().replace(/\.+$/u, ''))
    .filter((part) => part.length > 0)
    .join('. ');
}

function recordOmitted(
  omitted: GenerationBriefOmittedSignal[],
  field: string,
  reason: string,
  policy: GenerationFidelityPolicy,
  required: boolean,
): void {
  if (!policy.applyConstraints && !required) {
    return;
  }

  if (required && policy.unsupportedConstraintBehavior === 'reject') {
    throw new GenerationBriefCompileError(
      `FLUX Schnell cannot honor required ${field}.`,
      'unsupported_required_signal',
    );
  }

  omitted.push({ field, reason });
}

function resolveAspectRatio(brief: ImageGenerationBrief): string {
  const requested =
    brief.output.aspectRatio ??
    FLUX_SCHNELL_CAPABILITY_PROFILE.defaultAspectRatio;

  return normalizeAspectRatioForModel(FLUX_SCHNELL_MODEL_KEY, requested);
}

function buildPrompt(
  brief: ImageGenerationBrief,
  policy: GenerationFidelityPolicy,
  omitted: GenerationBriefOmittedSignal[],
): string {
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

  if (policy.applyConstraints) {
    for (const constraint of brief.constraints) {
      if (constraint.kind === 'desired_outcome') {
        parts.push(constraint.value);
        continue;
      }

      if (constraint.kind === 'exact_composition') {
        parts.push(constraint.value);
        continue;
      }

      recordOmitted(
        omitted,
        `constraints.${constraint.kind}`,
        'FLUX Schnell has no native negative-prompt field.',
        policy,
        constraint.required,
      );
    }
  }

  const prompt = joinPromptParts(parts);
  if (!prompt) {
    throw new GenerationBriefCompileError(
      'FLUX Schnell compilation produced an empty prompt.',
      'invalid_brief',
    );
  }

  if (prompt.length > FLUX_SCHNELL_CAPABILITY_PROFILE.prompt.maxCharacters) {
    throw new GenerationBriefCompileError(
      'FLUX Schnell prompt exceeds the capability profile character limit.',
      'invalid_brief',
    );
  }

  return prompt;
}

export function compileFluxSchnellGenerationBrief(
  input: CompileFluxSchnellGenerationBriefInput,
): FluxSchnellCompileResult {
  if (input.brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'FLUX Schnell compilation requires an image generation brief.',
      'invalid_brief',
    );
  }

  const policy = generationFidelityPolicies[input.brief.fidelityMode];
  const omitted: GenerationBriefOmittedSignal[] = [];

  if (input.brief.references.length > 0) {
    const hasRequiredReference = input.brief.fidelityMode === 'strict';
    recordOmitted(
      omitted,
      'references',
      'FLUX Schnell has no native reference-image field.',
      policy,
      hasRequiredReference,
    );
  }

  const prompt = buildPrompt(input.brief, policy, omitted);
  const aspectRatio = resolveAspectRatio(input.brief);
  const defaults = FLUX_SCHNELL_CAPABILITY_PROFILE.defaults;
  const outputFormat = input.outputFormat?.trim() || defaults.outputFormat;

  const dispatch: FluxSchnellDispatch = {
    aspect_ratio: aspectRatio,
    disable_safety_checker: defaults.disableSafetyChecker,
    go_fast: defaults.goFast,
    num_inference_steps: defaults.numInferenceSteps,
    num_outputs: defaults.numOutputs,
    output_format: outputFormat,
    output_quality: defaults.outputQuality,
    prompt,
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  };

  const appliedFields = [
    'intent.objective',
    'output.aspectRatio',
    ...(input.brief.intent.subjects.length > 0 ? ['intent.subjects'] : []),
    ...(input.brief.intent.scene ? ['intent.scene'] : []),
    ...(input.brief.intent.composition ? ['intent.composition'] : []),
    ...(input.brief.intent.lighting ? ['intent.lighting'] : []),
    ...(input.brief.intent.visualDirection ? ['intent.visualDirection'] : []),
    ...(input.brief.intent.requestedText.length > 0
      ? ['intent.requestedText']
      : []),
    ...(policy.applyConstraints
      ? input.brief.constraints
          .filter((constraint) => constraint.kind !== 'avoid')
          .map((constraint) => `constraints.${constraint.kind}`)
      : []),
    ...(input.seed !== undefined ? ['seed'] : []),
  ];

  const evidence: GenerationBriefCompileEvidence = {
    appliedFields,
    briefVersion: GENERATION_BRIEF_CONTRACT_VERSION,
    compilerId: FLUX_SCHNELL_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
    fidelityMode: input.brief.fidelityMode,
    mediaKind: 'image',
    modelKey: FLUX_SCHNELL_MODEL_KEY,
    omittedSignals: omitted,
    output: {
      aspectRatio,
      hasSeed: input.seed !== undefined,
      numOutputs: defaults.numOutputs,
      outputFormat,
    },
    profileId: FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
    referenceAssetIds: input.brief.references.map(
      (reference) => reference.assetId,
    ),
    status: 'compiled',
  };

  return fluxSchnellCompileResultSchema.parse({
    brief: input.brief,
    dispatch,
    evidence,
  });
}
