import {
  getImageGenerationBriefExemptionReason,
  getImageGenerationBriefRegistryEntry,
} from '@api/services/generation-brief/image-generation-brief-registry';
import type { GenerationBriefSupport } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';

export function resolveImageGenerationBriefSupport(
  model: string,
): GenerationBriefSupport {
  const entry = getImageGenerationBriefRegistryEntry(model);
  if (entry) {
    return {
      compilerId: entry.compilerId,
      compilerVersion: entry.compilerVersion,
      kind: 'compile',
      modelKey: entry.modelKey,
      profileId: entry.profileId,
      profileVersion: entry.profileVersion,
    };
  }

  const exemptionReason = getImageGenerationBriefExemptionReason(model);

  return {
    compilerId: null,
    kind: 'exempt',
    modelKey: model,
    profileId: null,
    reason: exemptionReason ?? 'unregistered_model',
  };
}
