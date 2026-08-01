/**
 * Swap catalog placeholder brand names for the live brand label so interview
 * chips/examples never show fictional "Acme Inc" when we already know the brand.
 */
export function personalizeBrandInterviewExamples(
  examples: string[] | undefined,
  context: {
    brandName?: string | null;
    description?: string | null;
  },
): string[] {
  if (!examples?.length) {
    return [];
  }

  const brandName = context.brandName?.trim() || 'your brand';
  const description = context.description?.trim();

  return examples.map((example) => {
    let next = example
      .replaceAll('{{brandName}}', brandName)
      .replace(/Acme Inc\.?/gi, brandName)
      .replace(/\bAcme\b/gi, brandName)
      .replace(/BoldCraft Studio/gi, brandName);

    if (description) {
      next = next.replaceAll('{{description}}', description);
    }

    return next;
  });
}
