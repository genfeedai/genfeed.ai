import type { PrepareCrunGenerationIntentProps } from '@genfeedai/props/studio/studio-generate.props';

/** One deterministic editor projection shared by quote preview and submission. */
export function prepareCrunGenerationIntent({
  document,
  existingReferenceIds,
  prompt,
  resolvePromptCommands,
  resolveCharacterMentions,
}: PrepareCrunGenerationIntentProps) {
  const { content, skillSlugs } = resolvePromptCommands(prompt);
  const prepared = resolveCharacterMentions({
    document,
    existingReferenceIds,
    text: content,
  });
  return { ...prepared, skillSlugs };
}
