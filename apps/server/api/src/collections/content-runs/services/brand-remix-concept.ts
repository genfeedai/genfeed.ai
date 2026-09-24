import {
  type BrandRemixConcept,
  type BrandRemixConceptEdits,
  type BrandRemixSourceSnapshot,
  brandRemixConceptSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';

const CONCEPT_DIRECTION_LIMIT = 1_000;

/**
 * Prefill a saved idea from the abstracted source pattern and the original
 * objective. Source copy, title, and media stay out of the concept.
 */
export function seedBrandRemixConcept(input: {
  objective: string;
  pattern: BrandRemixSourceSnapshot['pattern'];
  savedAt: string;
}): BrandRemixConcept {
  const angle = input.pattern.angle ?? input.pattern.structure;
  const hook = input.pattern.hook;
  const visualIntent =
    input.pattern.visualDirection ??
    input.pattern.structure ??
    'Original brand scene.';
  return brandRemixConceptSchema.parse({
    ...(angle ? { angle } : {}),
    ...(hook ? { hook } : {}),
    savedAt: input.savedAt,
    script: input.objective,
    storyboard: [
      {
        ordinal: 1,
        visualIntent,
        ...(hook ? { narration: hook } : {}),
      },
    ],
  });
}

export function mergeBrandRemixConcept(
  current: BrandRemixConcept | undefined,
  edits: BrandRemixConceptEdits,
  savedAt: string,
): BrandRemixConcept {
  const pick = (
    next: string | null | undefined,
    previous: string | undefined,
  ): string | undefined => {
    if (next === null) return undefined;
    if (typeof next === 'string') return next;
    return previous;
  };
  return brandRemixConceptSchema.parse({
    angle: pick(edits.angle, current?.angle),
    hook: pick(edits.hook, current?.hook),
    savedAt,
    script: pick(edits.script, current?.script),
    storyboard: edits.storyboard ?? current?.storyboard ?? [],
  });
}

/** Short creative direction for the existing single-output brief. Not scene assembly. */
export function brandRemixConceptDirection(
  concept: BrandRemixConcept | undefined,
): string | undefined {
  if (!concept) return undefined;
  const parts = [
    concept.angle ? `Angle: ${concept.angle}` : '',
    concept.hook ? `Hook: ${concept.hook}` : '',
    ...concept.storyboard.map((scene) => {
      const narration = scene.narration ? ` Narration: ${scene.narration}` : '';
      return `Scene ${scene.ordinal}: ${scene.visualIntent}.${narration}`;
    }),
  ].filter((part) => part.length > 0);
  const text = parts.join(' ');
  if (!text) return undefined;
  if (text.length <= CONCEPT_DIRECTION_LIMIT) return text;
  return `${text.slice(0, CONCEPT_DIRECTION_LIMIT - 3)}...`;
}
