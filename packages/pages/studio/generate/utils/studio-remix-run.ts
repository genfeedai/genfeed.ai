import type {
  BrandRemixDraft,
  BrandRemixDraftEdits,
  BrandRemixRunView,
} from '@api-types/contracts';
import { pairedBrandRemixIdentitySchema } from '@api-types/contracts';
import type {
  StudioGenerateSettings,
  StudioGenerateType,
} from '@pages/studio/generate/types';

/**
 * The durable identity union also carries the empty prefill shape, which does
 * not narrow through an `in` check. Parse through the contract schema so only
 * a real paired avatar/voice identity survives.
 */
export function resolvePairedRemixIdentity(
  identity: BrandRemixDraft['identity'],
): ReturnType<typeof pairedBrandRemixIdentitySchema.parse> | null {
  const parsed = pairedBrandRemixIdentitySchema.safeParse(identity);
  return parsed.success ? parsed.data : null;
}

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
  const canonicalIdentity = resolvePairedRemixIdentity(run.draft.identity);
  return {
    fidelityMode: run.draft.fidelityMode,
    ...(outputKind === 'avatar' && canonicalIdentity
      ? { identity: canonicalIdentity }
      : outputKind !== 'avatar' &&
          run.draft.output.kind === 'avatar' &&
          canonicalIdentity
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
