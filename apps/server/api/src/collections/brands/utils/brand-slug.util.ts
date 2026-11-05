const NON_ALPHANUMERIC_RUNS_PATTERN = /[^a-z0-9]+/g;
const REPEATED_HYPHENS_PATTERN = /-{2,}/g;
const EDGE_HYPHEN_PATTERN = /^-|-$/g;

/** Lowercase, hyphen-separated slug base for a brand label. */
export function toBrandSlugBase(label: string): string {
  return label
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RUNS_PATTERN, '-')
    .replace(REPEATED_HYPHENS_PATTERN, '-')
    .replace(EDGE_HYPHEN_PATTERN, '');
}
