import type {
  SkillDraft,
  SkillDraftPatchResult,
} from '@props/settings/skills.props';

const LIMITS = {
  name: 140,
  description: 2000,
  defaultInstructions: 8000,
  systemPromptTemplate: 16000,
} as const;

// biome-ignore lint/suspicious/noMisleadingCharacterClass: Matches backend validator isLength exactly.
const PRESENTATION = /[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g;

/** Matches validator/lib/isLength, including surrogate pairs and presentation sequences. */
function backendStringLength(value: string): number {
  const presentationSequences = value.match(PRESENTATION)?.length ?? 0;
  return (
    value.length -
    (value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0) -
    presentationSequences
  );
}

export function prepareSkillDraftPatch(
  original: SkillDraft,
  draft: SkillDraft,
): SkillDraftPatchResult {
  const result: SkillDraftPatchResult = {
    patch: {},
    errors: [],
    hasChanges: false,
  };
  for (const field of Object.keys(LIMITS) as (keyof SkillDraft)[]) {
    if (original[field] === draft[field]) continue;
    result.hasChanges = true;
    result.patch[field] = draft[field];
    if (backendStringLength(draft[field]) > LIMITS[field])
      result.errors.push({ field, maximum: LIMITS[field] });
  }
  return result;
}
