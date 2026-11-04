import {
  fitBrandContextToPromptBudget,
  joinGenerationBriefPromptParts,
  recordOmittedGenerationBriefSignal,
} from '@api/services/generation-brief/compile-image-generation-brief.util';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type {
  GenerationFidelityPolicy,
  VideoGenerationBrief,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { VideoGenerationBriefOmittedSignal } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';

/** The brief's intent as prompt parts, objective first and audio direction last. */
export function buildVideoGenerationBriefIntentParts(
  brief: VideoGenerationBrief,
): string[] {
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
  if (brief.intent.cinematography) {
    parts.push(brief.intent.cinematography);
  }
  if (brief.intent.motion) {
    parts.push(brief.intent.motion);
  }
  if (brief.intent.visualDirection) {
    parts.push(brief.intent.visualDirection);
  }
  if (brief.intent.audioDirection) {
    parts.push(`Audio: ${brief.intent.audioDirection}`);
  }

  return parts;
}

/**
 * The full prompt for a video model with no negative-prompt field: intent, visible text,
 * positive constraints, then brand context fitted to the remaining character budget. Avoid
 * constraints are recorded as omitted.
 */
export function buildVideoGenerationBriefPrompt(
  brief: VideoGenerationBrief,
  policy: GenerationFidelityPolicy,
  omitted: VideoGenerationBriefOmittedSignal[],
  model: Readonly<{ label: string; maxCharacters: number }>,
): string {
  const parts = buildVideoGenerationBriefIntentParts(brief);

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

      recordOmittedGenerationBriefSignal(
        omitted,
        `constraints.${constraint.kind}`,
        `${model.label} has no native negative-prompt field.`,
        policy,
        constraint.required,
        model.label,
      );
    }
  }

  // Independent of fidelity policy — brand voice follows Brand voice only.
  // Fit into whatever budget is left after everything else (#4676).
  const fittedBrandContext = fitBrandContextToPromptBudget({
    brandContext: brief.intent.brandContext,
    maxCharacters: model.maxCharacters,
    modelLabel: model.label,
    omitted,
    otherPartsLength: joinGenerationBriefPromptParts(parts).length,
  });
  if (fittedBrandContext) {
    parts.push(fittedBrandContext);
  }

  const prompt = joinGenerationBriefPromptParts(parts);
  if (!prompt) {
    throw new GenerationBriefCompileError(
      `${model.label} compilation produced an empty prompt.`,
      'invalid_brief',
    );
  }

  if (prompt.length > model.maxCharacters) {
    throw new GenerationBriefCompileError(
      `${model.label} prompt exceeds the capability profile character limit.`,
      'invalid_brief',
    );
  }

  return prompt;
}
