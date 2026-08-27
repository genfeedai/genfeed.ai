import type { VideoGenerationBriefSupport } from '@api-types/contracts/video-generation-brief-compiler.contract';
import {
  getVideoGenerationBriefExemptionReason,
  getVideoGenerationBriefRegistryEntry,
} from '@server/services/generation-brief/video-generation-brief-registry';

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
