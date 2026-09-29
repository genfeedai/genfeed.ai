import type {
  BrandRemixDraft,
  BrandRemixDraftEdits,
  BrandRemixRunView,
} from '@genfeedai/contracts/api-types/contracts';
import { pairedBrandRemixIdentitySchema } from '@genfeedai/contracts/api-types/contracts';
import type { StoryboardRunRecipe } from '@genfeedai/contracts/interfaces';

export const STORYBOARD_RUN_MIN_DURATION_SECONDS = 1;
export const STORYBOARD_RUN_MAX_DURATION_SECONDS = 300;
export const STORYBOARD_RUN_MAX_OUTPUTS = 8;
/** Aspect ratios the run generator dispatches (`SUPPORTED_ASPECT_RATIOS`). */
export const STORYBOARD_RUN_ASPECT_RATIOS = ['9:16', '1:1', '4:5', '16:9'];

/**
 * The durable identity union also carries the empty prefill shape, which does
 * not narrow through an `in` check. Parse through the contract schema so only
 * a real paired avatar/voice identity survives.
 */
export function resolvePairedRunIdentity(
  identity: BrandRemixDraft['identity'],
): ReturnType<typeof pairedBrandRemixIdentitySchema.parse> | null {
  const parsed = pairedBrandRemixIdentitySchema.safeParse(identity);
  return parsed.success ? parsed.data : null;
}

export function clampRunDurationSeconds(value: unknown): number | undefined {
  const duration = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    return undefined;
  }

  return Math.min(
    STORYBOARD_RUN_MAX_DURATION_SECONDS,
    Math.max(STORYBOARD_RUN_MIN_DURATION_SECONDS, Math.round(duration)),
  );
}

export function getStoryboardRunRecipe(
  run: BrandRemixRunView,
): StoryboardRunRecipe {
  const { output } = run.draft;
  return {
    ...(output.kind === 'copy' ? {} : { aspectRatio: output.aspectRatio }),
    count: output.count,
    ...('durationSeconds' in output
      ? { durationSeconds: clampRunDurationSeconds(output.durationSeconds) }
      : {}),
    objective: run.draft.intent.objective,
    referenceAssetIds: run.draft.references
      .filter((reference) => reference.source === 'explicit')
      .map((reference) => reference.assetId),
  };
}

export function getStoryboardRunAspectRatioOptions(current?: string) {
  return Array.from(
    new Set([...(current ? [current] : []), ...STORYBOARD_RUN_ASPECT_RATIOS]),
  ).map((ratio) => ({ label: ratio, value: ratio }));
}

/** Recipe → revision edits. The output kind and identity stay the run's own. */
export function buildStoryboardRunEdits(
  run: BrandRemixRunView,
  recipe: StoryboardRunRecipe,
): BrandRemixDraftEdits {
  const { draft } = run;
  const canonicalIdentity = resolvePairedRunIdentity(draft.identity);
  const durationSeconds = clampRunDurationSeconds(recipe.durationSeconds);
  const explicitReferences = draft.references.filter(
    (reference) => reference.source === 'explicit',
  );
  return {
    fidelityMode: draft.fidelityMode,
    ...(draft.output.kind === 'avatar' && canonicalIdentity
      ? { identity: canonicalIdentity }
      : {}),
    intent: {
      ...draft.intent,
      objective: recipe.objective.trim(),
    },
    output:
      draft.output.kind === 'copy'
        ? { count: recipe.count, kind: 'copy' }
        : {
            aspectRatio: recipe.aspectRatio ?? draft.output.aspectRatio,
            count: recipe.count,
            kind: draft.output.kind,
            ...(draft.output.kind === 'image'
              ? { durationSeconds: null }
              : durationSeconds
                ? { durationSeconds }
                : {}),
          },
    references: Array.from(new Set(recipe.referenceAssetIds)).map((assetId) => {
      const existing = explicitReferences.find(
        (reference) => reference.assetId === assetId,
      );
      return existing
        ? {
            assetId,
            ...(existing.description
              ? { description: existing.description }
              : {}),
            role: existing.role,
          }
        : { assetId, role: 'style' as const };
    }),
    target: draft.target,
  };
}
