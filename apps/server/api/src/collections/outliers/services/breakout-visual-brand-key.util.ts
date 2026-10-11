/**
 * The request key of the approved-brand validation receipt of one generated visual. It lives
 * apart from the receipt service so the recovery reader, which the publication gates load,
 * does not pull the receipt services into its import graph.
 */
export function breakoutVisualBrandRequestKey(ingredientId: string): string {
  return `${ingredientId}:brand-validation`;
}
