import type {
  BrandRemixDraftEdits,
  BrandRemixRunView,
} from '@api-types/contracts';
import type {
  StudioGenerateSettings,
  StudioGenerateType,
} from '@pages/studio/generate/types';

export function buildStudioRemixRunEdits(
  run: BrandRemixRunView,
  prompt: string,
  settings: StudioGenerateSettings,
  type: StudioGenerateType,
): BrandRemixDraftEdits {
  const outputKind =
    type === 'image' || type === 'video' || type === 'avatar'
      ? type
      : run.draft.output.kind;
  const hasCanonicalIdentity = 'avatarAssetId' in run.draft.identity;
  return {
    fidelityMode: run.draft.fidelityMode,
    ...(outputKind === 'avatar' && hasCanonicalIdentity
      ? { identity: run.draft.identity }
      : outputKind !== 'avatar' &&
          run.draft.output.kind === 'avatar' &&
          hasCanonicalIdentity
        ? {
            identity: {
              avatarAssetId: null,
              speechVoiceId: null,
            },
          }
        : {}),
    intent: {
      ...run.draft.intent,
      objective: prompt.trim(),
    },
    output: {
      aspectRatio: settings.aspectRatio,
      count: settings.outputs,
      kind: outputKind,
      ...(outputKind === 'image'
        ? { durationSeconds: null }
        : settings.duration
          ? { durationSeconds: settings.duration }
          : {}),
    },
    references: run.draft.references
      .filter((reference) => reference.source === 'explicit')
      .map((reference) => ({
        assetId: reference.assetId,
        ...(reference.description
          ? { description: reference.description }
          : {}),
        role: reference.role,
      })),
    target: run.draft.target,
  };
}
