/**
 * The values the objective does not already say. An enhanced prompt often
 * carries the subject or action in its own words; repeating them after it
 * adds nothing and pushes the prompt toward a model's character limit.
 */
export function omitMentionedText(
  objective: string,
  values: ReadonlyArray<string | undefined>,
): string[] {
  const haystack = objective.toLowerCase();
  return values
    .map((value) => value?.trim())
    .filter(
      (value): value is string =>
        !!value && !haystack.includes(value.toLowerCase()),
    );
}
