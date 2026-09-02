import type {
  BrandRemixDraft,
  BrandRemixDraftEdits,
  BrandRemixRunView,
} from '@genfeedai/contracts/api-types/contracts';
import { pairedBrandRemixIdentitySchema } from '@genfeedai/contracts/api-types/contracts';
import type {
  StudioGenerateSettings,
  StudioGenerateType,
} from '@pages/studio/generate/types';

export const REMIX_MIN_DURATION_SECONDS = 1;
export const REMIX_MAX_DURATION_SECONDS = 300;

type RemixMediaType = Extract<StudioGenerateType, 'avatar' | 'image' | 'video'>;

export type RemixDraftComposerState = {
  prompt: string;
  settings: Partial<StudioGenerateSettings>;
  type: RemixMediaType | null;
};

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

export function clampRemixDurationSeconds(value: unknown): number | undefined {
  const duration = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    return undefined;
  }

  return Math.min(
    REMIX_MAX_DURATION_SECONDS,
    Math.max(REMIX_MIN_DURATION_SECONDS, Math.round(duration)),
  );
}

export function getRemixDraftComposerState(
  run: BrandRemixRunView,
): RemixDraftComposerState {
  const { output } = run.draft;
  const prompt = run.draft.intent.objective;

  if (output.kind === 'copy') {
    return {
      prompt,
      settings: { outputs: output.count },
      type: null,
    };
  }

  return {
    prompt,
    settings: {
      aspectRatio: output.aspectRatio,
      duration:
        'durationSeconds' in output
          ? clampRemixDurationSeconds(output.durationSeconds)
          : undefined,
      outputs: output.count,
    },
    type: output.kind,
  };
}

export function buildStudioRemixRunEdits(
  run: BrandRemixRunView,
  prompt: string,
  settings: StudioGenerateSettings,
  type: StudioGenerateType,
  selectedLibraryAssetIds: string[] = [],
): BrandRemixDraftEdits {
  const outputKind =
    run.draft.output.kind === 'copy'
      ? 'copy'
      : type === 'image' || type === 'video' || type === 'avatar'
        ? type
        : run.draft.output.kind;
  const canonicalIdentity = resolvePairedRemixIdentity(run.draft.identity);
  const durationSeconds = clampRemixDurationSeconds(settings.duration);
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
    output:
      outputKind === 'copy'
        ? { count: settings.outputs, kind: outputKind }
        : {
            aspectRatio: settings.aspectRatio,
            count: settings.outputs,
            kind: outputKind,
            ...(outputKind === 'image'
              ? { durationSeconds: null }
              : durationSeconds
                ? { durationSeconds }
                : {}),
          },
    references: [
      ...run.draft.references
        .filter((reference) => reference.source === 'explicit')
        .map((reference) => ({
          assetId: reference.assetId,
          ...(reference.description
            ? { description: reference.description }
            : {}),
          role: reference.role,
        })),
      ...selectedLibraryAssetIds
        .filter(
          (assetId) =>
            !run.draft.references.some(
              (reference) =>
                reference.assetId === assetId &&
                reference.source === 'explicit',
            ),
        )
        .map((assetId) => ({ assetId, role: 'style' as const })),
    ],
    target: run.draft.target,
  };
}
