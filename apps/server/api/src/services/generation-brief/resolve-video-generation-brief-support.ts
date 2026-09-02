import {
  getVideoGenerationBriefExemptionReason,
  getVideoGenerationBriefRegistryEntry,
} from '@api/services/generation-brief/video-generation-brief-registry';
import type { VideoGenerationBriefSupport } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';

export function resolveVideoGenerationBriefSupport(
  model: string,
): VideoGenerationBriefSupport {
  const entry = getVideoGenerationBriefRegistryEntry(model);
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

  const exemptionReason = getVideoGenerationBriefExemptionReason(model);

  return {
    compilerId: null,
    kind: 'exempt',
    modelKey: model,
    profileId: null,
    reason: exemptionReason ?? 'unregistered_model',
  };
}
